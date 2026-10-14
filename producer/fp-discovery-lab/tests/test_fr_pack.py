"""France pack (fpd/packs/fr.py) and DATAtourisme lane: French dates, geography, classification, scope and safety."""
import datetime as dt
import json
import time
from pathlib import Path

import pytest

from fpd import db as dbm
from fpd.classify import classify
from fpd.dates import extract_dates
from fpd.frontier import Frontier
from fpd.geo import infer_geo
from fpd.generators import datatourisme as dtour
from fpd.packs.fr import region_of_postcode
from fpd.parse import parse_html
from fpd.state import route_category

T = dt.date(2026, 10, 14)
FX = Path(__file__).parent / "fixtures"


def _cls(name, url, hint=None):
    page = parse_html((FX / name).read_bytes(), url)
    return classify(page, T, hint=hint or {"country": "FR", "site_role": "organiser"})


def _cls_html(body, url="https://www.mairie-exemple.fr/marche-de-noel/inscription", title="Marché de Noël"):
    html = f"<html><head><title>{title}</title></head><body><h1>{title}</h1><main>{body}</main></body></html>"
    return classify(parse_html(html, url), T, hint={"country": "FR", "site_role": "organiser"})


# ---------------------------------------------------------------- dates
@pytest.mark.parametrize("text,start,end", [
    ("qui se déroulera le samedi 5 et dimanche 6 décembre 2026.", "2026-12-05", "2026-12-06"),
    ("Du 27 novembre au 27 décembre 2026", "2026-11-27", "2026-12-27"),
    ("du 28 novembre 2026 au 3 janvier 2027", "2026-11-28", "2027-01-03"),
    ("le 1er décembre 2026", "2026-12-01", None),
    ("Samedi 7 et dimanche 8 novembre 2026", "2026-11-07", "2026-11-08"),
    ("les 12 et 13 déc. 2026", "2026-12-12", "2026-12-13"),
])
def test_french_dates(text, start, end):
    d = extract_dates(text, T)[0]
    assert d.start.isoformat() == start and (d.end.isoformat() if d.end else None) == end


def test_french_deadline_cue_not_swallowed():
    # "avant le 15 novembre" must leave "avant le" outside the date so the deadline cue sees it
    d = extract_dates("dossier de candidature avant le 15 novembre 2026 à l'adresse", T)[0]
    assert d.raw.startswith("15")


def test_english_dates_unchanged():
    assert extract_dates("Sept 19-20, 2026", T)[0].end == dt.date(2026, 9, 20)
    assert extract_dates("Marché de mai 2026", T) == []
    # "1 Sept" / "5 Dec" stay on the English path (no wider French year window): no year nearby -> no date
    far = "x " * 160
    assert extract_dates("Opens 1 Sept " + far + " 2025", T) == []
    assert extract_dates("Fair on 5 Dec " + far + " 2025", T) == []


# ---------------------------------------------------------------- geography
def test_postcode_region():
    assert region_of_postcode("38180") == ("FR-ARA", "Auvergne-Rhône-Alpes")
    assert region_of_postcode("20000")[0] == "FR-20R"
    assert region_of_postcode("97400")[0] == "FR-RE"
    assert region_of_postcode("1234") is None


FR_PROSE = ("Le marché de Noël aura lieu sur la place de la mairie et vous pouvez nous contacter pour les "
            "inscriptions des exposants, avec les horaires et les tarifs pour la journée. ")


def test_geo_france_and_us_not_confused():
    g = infer_geo("https://www.seyssins.fr/x", FR_PROSE + "Mairie 38180 Seyssins Tél 04 76 21 04 14", [], {})
    assert (g["country"], g["region"], g["locality"]) == ("FR", "Auvergne-Rhône-Alpes", "Seyssins")
    assert infer_geo("https://x.com/", FR_PROSE + "72000 Le Mans", [], {})["locality"] == "Le Mans"
    # Same postcode shapes on an English page are not French evidence (classifier-diff on the Pi, 14 Oct:
    # Marketspread listings print "20111\nGo"; a US Jotform flipped to FR).
    en = "Market listings near you. Find a market and apply as a vendor today. "
    ms = infer_geo("https://marketspread.com/market/1/x/", en * 3 + "Manassas, VA 20111\nGo 24426\nGo 20110 Premium France", [], {})
    assert "FR" not in ms["votes"]
    us = infer_geo("https://example.com/", "12345 Fairview Road, Austin, TX 78701", [], {})
    assert us["country"] == "US" and "FR" not in us["votes"]
    us2 = infer_geo("https://example.com/", "Springfield, IL 62701 Vendor fair", [], {})
    assert us2["country"] == "US" and "FR" not in us2["votes"]


# ---------------------------------------------------------------- real organiser pages (DATAtourisme census, 14 Oct)
def test_seyssins_call_for_applications_is_usable():
    a = _cls("fr_seyssins_marche_noel_appel_2026-10-14.html",
             "https://www.seyssins.fr/actualite/601/17-marche-de-noel-appel-a-candidatures.htm")
    x = a["extracted"]
    assert a["label"] == "actionable" and x["state"] == "ENQUIRY_AVAILABLE"
    assert x["start_date"] == "2026-12-10" and x["deadline"] == "2026-11-15"
    assert [r["type"] for r in x["routes"]] == ["email"] and x["routes"][0]["url"] == "mailto:marchedenoel@mairie-seyssins.fr"
    assert (x["country"], x["region"]) == ("FR", "Auvergne-Rhône-Alpes")
    assert x["name"] == "MARCHÉ DE NOËL"                       # source text kept verbatim, nothing translated


def test_valdemoder_waitlist_is_closed_not_open():
    a = _cls("fr_valdemoder_inscription_waitlist_2026-10-14.html", "https://www.noel.valdemoder.fr/marche-de-noel/inscription/")
    x = a["extracted"]
    assert x["state"] == "CLOSED_CURRENT_CYCLE" and x["start_date"] == "2026-12-05"   # header clock date ignored
    assert x["name"] == "Noël à Val-de-Moder"


def test_ornans_land_tenancy_call_is_not_a_market():
    assert _cls("fr_ornans_afp_appel_candidature_2026-10-14.html",
                "https://www.ornans.fr/afp-des-coteaux-dornans-appel-a-candidature/")["label"] == "rejected"


def test_shopper_homepage_with_exhibitor_count_is_not_a_route():
    a = _cls("fr_valence_village_noel_home_2026-10-14.html", "https://www.village-noel-valence.com/")
    assert a["label"] == "rejected"   # "Plus de quarante exposants seront présents" is attendee copy


# ---------------------------------------------------------------- synthetic rules
def test_phone_booking_instruction_is_a_contact_route():
    a = _cls_html("<p>Marché de Noël artisanal le samedi 5 décembre 2026, place de la Mairie, 81000 Albi.</p>"
                  "<p>Inscription des exposants : 3 € le mètre linéaire. Inscriptions exposants au 06 12 34 56 78.</p>")
    x = a["extracted"]
    assert a["features"]["vendor_signal"] == "strong"
    assert any(r["type"] == "contact_instruction" and "06 12 34 56 78" in r["text"] for r in x["routes"])


def test_private_sellers_brocante_excluded_but_pro_brocante_kept():
    private = _cls_html("<p>Vide-grenier le dimanche 8 novembre 2026, 24000 Périgueux. Réservé aux particuliers. "
                        "Réservation des emplacements au 06 12 34 56 78, 2 € le mètre.</p>", title="Vide-grenier de l'école")
    assert private["label"] == "rejected" and private["reasons"] == ["private_sellers_event"]
    silent = _cls_html("<p>Brocante le dimanche 8 novembre 2026, 24000 Périgueux. Réservation des emplacements au "
                       "06 12 34 56 78, 2 € le mètre.</p>", title="Brocante d'automne")
    assert silent["reasons"] == ["private_sellers_event"]     # professionals not explicitly allowed -> out (Chris)
    pro = _cls_html("<p>Brocante le dimanche 8 novembre 2026, 24000 Périgueux. Ouvert aux professionnels et particuliers. "
                    "Réservation des emplacements au 06 12 34 56 78, 3 € le mètre.</p>", title="Brocante d'automne")
    assert pro["label"] != "rejected"


def test_public_procurement_is_not_a_market():
    a = _cls_html("<p>Marchés publics : avis d'appel public à la concurrence. Consultation des entreprises, DCE à "
                  "télécharger. Pouvoir adjudicateur : commune. Candidatures avant le 30 novembre 2026.</p>",
                  url="https://www.ville-exemple.fr/marches-publics/consultation-12", title="Appel d'offres travaux")
    assert a["label"] == "rejected"


def test_quebec_public_market_is_not_procurement():
    a = _cls_html("<p>Les Marchés publics de Montréal accueillent les producteurs. Les marchés publics de Montréal "
                  "recherchent des producteurs : inscriptions des producteurs pour la saison 2027, formulaire en ligne. "
                  "Marché Jean-Talon, 7070 avenue Henri-Julien, Montréal, QC H2S 3S3.</p>",
                  url="https://www.marchespublics-mtl.com/devenir-producteur/", title="Devenir producteur")
    assert "procurement_context" not in a["reasons"]


def test_job_forum_is_not_a_market():
    a = _cls_html("<p>Forum de l'emploi le 14 novembre 2026 : venez rencontrer 40 exposants. Offres d'emploi, "
                  "recrutement, France Travail. Inscription des exposants entreprises par mail.</p>", title="Forum emploi")
    assert a["label"] != "actionable"


def test_french_route_categories():
    assert route_category("Inscription des exposants") == "exhibitor"
    assert route_category("Formulaire artisans") == "craft"
    assert route_category("Food vendor application") == "food"


def test_english_page_unaffected_by_pack():
    html = ("<html><head><title>Riverside Craft Fair - Vendor Application</title></head><body><h1>Vendor Application</h1>"
            "<p>Vendor applications are now open for the Riverside Craft Fair, Saturday 5 December 2026, Albany, NY.</p>"
            "<a href='https://forms.gle/abc'>Apply now</a></body></html>")
    a = classify(parse_html(html, "https://riversidecraftfair.com/vendors"), T, hint={"site_role": "organiser"})
    assert a["label"] == "actionable" and a["extracted"]["country"] == "US"


# ---------------------------------------------------------------- DATAtourisme lane (hop one only)
def _dt_obj(uuid, label, end, types=("Market",), hp="https://www.mairie-exemple.fr/marche-de-noel"):
    return {"uuid": uuid, "label": {"fr": label}, "type": ["Event", *types],
            "takesPlaceAt": [{"startDate": end, "endDate": end}],
            "hasContact": [{"homepage": [hp]}] if hp else [],
            "isLocatedAt": [{"address": [{"addressLocality": "Albi", "postalCode": "81000"}]}]}


def test_datatourisme_select_filters():
    objs = [_dt_obj("a", "Marché de Noël", "2026-12-05"),
            _dt_obj("b", "Marché de Noël 2025", "2025-12-05"),                               # past
            _dt_obj("c", "Concert", "2026-12-05", types=("CulturalEvent",)),                 # not trading
            _dt_obj("d", "A SUPP Brocante", "2026-12-05"),                                   # marked for deletion
            _dt_obj("e", "Foire", "2026-12-05", hp="https://www.facebook.com/foire"),        # social: never enqueued
            _dt_obj("f", "Braderie", "2026-12-05", hp=None)]                                 # no website
    sel = dtour.select(objs, T)
    assert [s["uuid"] for s in sel] == ["a"] and sel[0]["postcode"] == "81000"


def test_datatourisme_run_enqueues_once_and_resumes(tmp_path, monkeypatch):
    monkeypatch.delenv("DATATOURISME_KEY", raising=False)
    conn = dbm.connect(tmp_path / "fpd.sqlite")
    fr = Frontier(conn, 1, 30, 3)
    tel = dbm.Telemetry(conn, 1)

    class Cfg:
        today = T
    pages = {1: {"objects": [_dt_obj("a", "Marché de Noël", "2026-12-05")], "meta": {"total": 150}},
             2: {"objects": [_dt_obj("b", "Foire", "2026-11-01", hp="https://www.foire-exemple.fr/")], "meta": {"total": 150}}}
    calls = []
    fetch = lambda p: calls.append(p) or pages[p]  # noqa: E731
    r1 = dtour.run(conn, fr, tel, Cfg, max_calls=1, fetch_page=fetch)
    assert r1["enqueued"] == 1 and r1["cursor"]["page"] == 2
    r2 = dtour.run(conn, fr, tel, Cfg, max_calls=1, fetch_page=fetch)          # resumes at page 2, then wraps
    assert r2["enqueued"] == 1 and r2["cursor"] == {**r2["cursor"], "page": 1, "passes": 1}
    r3 = dtour.run(conn, fr, tel, Cfg, max_calls=1, fetch_page=fetch)          # same site again: not re-enqueued
    assert r3["enqueued"] == 0 and r3["already_known"] == 1 and calls == [1, 2, 1]
    rows = conn.execute("SELECT url, purpose, generator, meta FROM urls ORDER BY id").fetchall()
    assert [(r["purpose"], r["generator"]) for r in rows] == [("candidate", "datatourisme:fr"), ("site_home", "datatourisme:fr")]
    assert json.loads(rows[0]["meta"])["country"] == "FR"


def test_datatourisme_without_key_does_nothing(tmp_path, monkeypatch):
    monkeypatch.delenv("DATATOURISME_KEY", raising=False)
    conn = dbm.connect(tmp_path / "fpd.sqlite")

    class Cfg:
        today = T
    r = dtour.run(conn, Frontier(conn, 1, 30, 3), dbm.Telemetry(conn, 1), Cfg)
    assert "skipped" in r and conn.execute("SELECT COUNT(*) FROM urls").fetchone()[0] == 0


def test_french_records_exported_only_when_switched_on(tmp_path, monkeypatch):
    from fpd.integration import records as R
    from fpd.integration.schema import COUNTRY_CODES
    assert "FR" in COUNTRY_CODES                       # contract enum carries FR (V3-019)
    monkeypatch.setenv("FPD_EXPORT_FR_FLAG", str(tmp_path / "export-fr.enabled"))
    assert "FR" not in R.supported_countries()        # default: held (country null, 'unsupported_or_unknown_country')
    (tmp_path / "export-fr.enabled").write_text("2026-10-14T12:00:00Z")
    assert "FR" in R.supported_countries()            # sudo fpd-v3-feed fr-on
    assert R.region_code("FR", "Auvergne-Rhône-Alpes") == "FR-ARA" and R.region_code("FR", "Bretagne") == "FR-BRE"


@pytest.mark.parametrize("name,organiser_only", [("Mairie de Seyssins", True), ("Ville de Gex", True),
                                                 ("Office de Tourisme Pays Basque", True),
                                                 ("Marché de Noël de la Ville de Gex", False), ("MARCHÉ DE NOËL", False)])
def test_french_authority_names(name, organiser_only):
    from fpd.integration.records import FR_AUTHORITY_ONLY, FR_EVENTISH
    assert bool(FR_AUTHORITY_ONLY.match(name) and not FR_EVENTISH.search(name)) is organiser_only


def test_deadline_today_with_time_is_not_a_header_clock():
    # Pi gate, 14 Oct: an Eventeny 'Deadline: Oct 14, 2026 11:59 pm' was dropped as a live clock -> wrongly CLOSED
    html = ("<html><head><title>Fall Festival - Food Vendor Application</title></head><body><h1>Food Vendor Application</h1>"
            "<p>Vendor applications are now open. Application deadline is October 9, 2026 for crafters.</p>"
            "<p>Deadline: Oct 14, 2026 11:59 pm (GMT-04:00) Eastern Time. Festival Saturday October 17, 2026, Cartersville, GA.</p>"
            "<a href='https://forms.gle/x'>Apply now</a></body></html>")
    x = classify(parse_html(html, "https://fallfest.example.com/vendors"), T, hint={"site_role": "organiser"})["extracted"]
    assert x["deadline"] == "2026-10-14" and x["state"] == "OPEN_NOW"
