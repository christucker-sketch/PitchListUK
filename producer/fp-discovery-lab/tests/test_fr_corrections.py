"""French producer corrections, 21 Oct 2026 (Codex's 18 Oct diagnosis: Angers, Plouarzel, La Verpillière,
Saint-Marcellin; Kilstett LOW). Synthetic pages that reproduce the stored source pages' structure and wording."""
import datetime as dt
import json

from fpd import db as dbm
from fpd.classify import classify
from fpd.dates import extract_dates
from fpd.frontier import Frontier
from fpd.integration.records import clean_organiser
from fpd.parse import parse_html
from fpd.resolve import Resolver

T = dt.date(2026, 10, 21)
FR = {"country": "FR", "site_role": "organiser"}


def _cls(html, url, hint=None, today=T):
    return classify(parse_html(html, url), today, hint=hint or FR)


def _page(title, body, extra_head=""):
    return (f"<html lang='fr'><head><title>{title}</title>{extra_head}</head><body><main>{body}</main>"
            f"<footer>Mentions légales</footer></body></html>")


# ---------------------------------------------------------------- dates
def test_comma_list_of_days_is_one_range():
    d = extract_dates("Rendez-vous au Parc des Expositions - Angers les 13, 14 et 15 novembre 2026 Billetterie", T)
    assert [(x.start.isoformat(), x.end.isoformat()) for x in d] == [("2026-11-13", "2026-11-15")]


def test_yearless_date_with_weekday_gets_its_year_from_the_weekday():
    far = "x " * 400  # no year anywhere near the date
    d = extract_dates(far + "Date limite d’inscription : vendredi 30 octobre ! " + far, T)
    assert [x.start.isoformat() for x in d] == ["2026-10-30"]
    assert extract_dates(far + "les 5 et 6 décembre" + far, T) == []  # no weekday, no year: still not guessed


# ---------------------------------------------------------------- Kilstett: deadline makes the call explicit
KILSTETT = _page("Marché de Noël de Kilstett - Appel aux exposants", """
<h1>Marché de Noël de Kilstett - Appel aux exposants</h1>
<p>APPEL AUX EXPOSANTS Le Marché de Noël de Kilstett se tiendra le dimanche 13 décembre 2026, de 10h à 20h.
La Commune recherche des créateurs, artisans et producteurs locaux.</p>""" + "<p>Chalets et chapiteaux en extérieur.</p>" * 30 + """
<p>Places limitées. Produits importés non acceptés</p><p>Date limite d’inscription : vendredi 30 octobre !</p>
<p>COMMENT S’INSCRIRE ? <a href="https://forms.gle/AbCdEf123">Je m’inscris en ligne</a>
<a href="/dynamic/pdf/inscription_mn2026.pdf">Je télécharge le formulaire papier</a></p>
<p>Mairie de Kilstett, 67840 Kilstett, 03 88 96 21 23</p>""")


def test_kilstett_call_with_deadline_is_explicitly_open():
    ex = _cls(KILSTETT, "https://www.kilstett.fr/Actus/Marche-Noel-Kilstett-Appel-exposants-00670.html")["extracted"]
    assert (ex["start_date"], ex["deadline"]) == ("2026-12-13", "2026-10-30")
    assert (ex["state"], ex["open_strength"]) == ("OPEN_NOW", "explicit"), ex["state_evidence"]
    assert ex["region"] == "Grand Est" and ex["locality"] == "Kilstett"


# ---------------------------------------------------------------- La Verpillière: application window vs event date
VERP_LD = json.dumps({"@context": "https://schema.org", "@type": "Event",
                      "name": "[jusqu&rsquo;au 20 novembre] Réservez votre stand au Marché de Noël 2026 !",
                      "startDate": "2026-09-25T08:00:00+02:00", "endDate": "2026-11-20T17:00:00+01:00"})
VERP = _page("[jusqu'au 20 novembre] Réservez votre stand au Marché de Noël 2026 ! - Ville de la Verpillière", """
<h1>[jusqu’au 20 novembre] Réservez votre stand au Marché de Noël 2026 !</h1>
<p>25 septembre à 8h00 - 20 novembre à 17h00</p>
<p>Inscrivez-vous Vous êtes artisan, commerçant, association et vous souhaitez exposer vos œuvres, créations au public
lors de ce moment magique ? Nous vous donnons rendez-vous le dimanche 6 décembre 2026 de 10h à 19h à la salle Jean Rabilloud.</p>
<p>Pour réserver un stand, c’est très simple : retournez le formulaire d’inscription et les justificatifs demandés avant le
20 novembre 2026. par courrier à la mairie 1 Place du Dr Ogier 38290 La Verpillière</p>
<p><a href="/wp-content/uploads/FICHE-INSCRIPTION-MARCHE-DE-NOEL-6-DECEMBRE-2026.pdf">FICHE INSCRIPTION MARCHE DE NOEL 6 DECEMBRE 2026</a></p>""",
             f'<script type="application/ld+json">{VERP_LD}</script>')


def test_calendar_entry_titled_as_the_call_is_the_application_window():
    ex = _cls(VERP, "https://www.laverpilliere.fr/evenement/jusquau-20-novembre-reservez-votre-stand-au-marche-de-noel-2026/")["extracted"]
    assert (ex["start_date"], ex["end_date"], ex["deadline"]) == ("2026-12-06", None, "2026-11-20")
    assert ex["name"] == "Marché de Noël 2026"
    assert ex["state"] == "OPEN_NOW" and ex["locality"] == "La Verpillière"


def test_a_real_event_entry_keeps_its_jsonld_dates():
    ld = json.dumps({"@context": "https://schema.org", "@type": "Event", "name": "Marché de Noël 2026",
                     "startDate": "2026-12-05", "endDate": "2026-12-06"})
    html = _page("Marché de Noël 2026", "<h1>Marché de Noël 2026</h1><p>Exposants : inscriptions ouvertes jusqu'au "
                 "20 novembre 2026. <a href='/inscription.pdf'>Dossier d'inscription exposant</a></p><p>Le 12 décembre 2026, "
                 "concert.</p><p>38290 La Verpillière</p>", f'<script type="application/ld+json">{ld}</script>')
    ex = _cls(html, "https://www.laverpilliere.fr/evenement/marche-de-noel-2026/")["extracted"]
    assert (ex["start_date"], ex["end_date"]) == ("2026-12-05", "2026-12-06")


# ---------------------------------------------------------------- Saint-Marcellin: the site's name is not the event's
SAINT_M = _page("Inscriptions au marché de Noël 2026 - Saint Marcellin, site officiel de la ville", """
<h1>Inscriptions au marché de Noël 2026</h1><p>Marché de Noël le 19 décembre 2026</p>
<p>Vous êtes artisans, créateurs ou producteurs et vous souhaitez vous inscrire au marché de Noël le 19 décembre.
Vous pouvez vous inscrire en téléchargeant le dossier d’inscription :
<a href="/wp-content/uploads/2026/07/Reglement-inscription-marche-de-Noel-2026-19-decembre.pdf">Règlement inscription
marché de Noël 2026 – 19 décembre</a></p><p>38160 Saint-Marcellin</p>""",
                '<meta property="og:site_name" content="Saint Marcellin, site officiel de la ville">')


def test_site_name_hint_does_not_replace_the_event_title():
    hint = dict(FR, entity_name="Saint Marcellin, site officiel de la ville")
    ex = _cls(SAINT_M, "https://www.saint-marcellin.fr/inscriptions-au-marche-de-noel-2026/", hint)["extracted"]
    assert ex["name"] == "Marché de Noël 2026" and ex["start_date"] == "2026-12-19"


def test_event_like_hint_still_names_the_event():
    html = _page("Exhibitors | Bramley Christmas Fair", "<h1>Exhibitors</h1><p>Bramley Christmas Fair, 5 December 2026. "
                 "Applications are now open. <a href='/apply'>Apply to exhibit</a></p>")
    ex = _cls(html, "https://bramleyfair.co.uk/exhibitors", {"country": "GB", "entity_name": "Bramley Christmas Fair"})["extracted"]
    assert ex["name"] == "Bramley Christmas Fair"


# ---------------------------------------------------------------- Plouarzel: organiser, never the form provider
PLOUARZEL = _page("Salon Saveurs & DECO", """<h1>Salon SAVEURS &amp; DÉCO</h1>
<p>Plouarzel animation organisera son 24ème salon « Saveurs &amp; DÉCO » les 24 et 25 octobre 2026 dans les deux salles du
complexe polyvalent. Plus de 70 exposants vous attendent. Si vous souhaitez postuler pour exposer lors de la prochaine
édition, soit vous : <a href="https://docs.google.com/forms/d/e/1FAIpQLSexample/viewform">complétez le formulaire en ligne</a></p>
<p>29810 PLOUARZEL 02 98 89 60 05</p>""")


def test_organiser_from_french_phrase():
    ex = _cls(PLOUARZEL, "https://www.plouarzel.fr/saveurs-et-deco.html")["extracted"]
    assert ex["organiser"] == "Plouarzel animation"


def test_form_provider_is_never_the_organiser():
    html = ("<html><head><title>Fiche de renseignements Salon Saveurs & DÉCO</title>"
            "<meta property='og:site_name' content='Google Docs'></head><body><form><input name=a><input name=b>"
            "<input type=submit></form><p>Salon Saveurs &amp; DÉCO du samedi 24 et dimanche 25 octobre 2026. Exposants : "
            "tarif du stand 110 €</p></body></html>")
    ex = _cls(html, "https://docs.google.com/forms/d/e/1FAIpQLSexample/viewform")["extracted"]
    assert ex["organiser"] is None
    assert clean_organiser("Google Docs") is None and clean_organiser("Plouarzel animation") == "Plouarzel animation"


def test_title_segment_names_the_association():
    html = _page("Marché de Noël de Hochstatt – Comité des Fêtes de Hochstatt", "<h1>Marché de Noël de Hochstatt</h1>"
                 "<p>Le samedi 28 novembre 2026. Vous êtes artisans et vous souhaitez participer ? "
                 "<a href='/preinscription-marche-de-noel-2026'>Inscription exposant</a></p>")
    ex = _cls(html, "https://hochstatt-asso.fr/comite-des-fetes-de-hochstatt/")["extracted"]
    assert ex["organiser"] == "Comité des Fêtes de Hochstatt"


# ---------------------------------------------------------------- Angers: event-scoped commune beats a region mention
ANGERS = _page("Exposer au Salon du Cheval d'Angers 2026", """<h1>Exposer au Salon du Cheval d'Angers 2026</h1>
<p>Exposer au Salon du Cheval d'Angers. Contactez-nous dès maintenant. Rendez-vous au Parc des Expositions - Angers les 13,
14 et 15 novembre 2026.</p><form><input name=a><input name=b><input name=c><input type=submit></form>
<p>Pourquoi exposer au Salon du Cheval d'Angers 2026 ? Une belle opportunité pour les professionnels.</p>
<p>Témoignage : une opportunité précieuse de rencontrer nos clients basés en Bretagne, Loire-Atlantique et Vendée.</p>""")


def test_event_commune_sets_region_not_a_quoted_region_name():
    ex = _cls(ANGERS, "https://www.salon-cheval-angers.com/exposer-au-salon-du-cheval-angers/")["extracted"]
    assert (ex["region"], ex["locality"]) == ("Pays de la Loire", "Angers")
    assert (ex["start_date"], ex["end_date"]) == ("2026-11-13", "2026-11-15")
    assert ex["name"] == "Salon du Cheval d'Angers 2026"


def test_ligature_commune_is_not_cut():
    html = _page("Espace exposants | Salon Délices et Saveurs Nancy", "<h1>Espace exposants</h1><p>Exposants : "
                 "téléchargez le dossier.</p><p>Parc Expo de Nancy • 12 route de Mirecourt<br>54500 Vandœuvre-lès-Nancy</p>")
    ex = _cls(html, "https://salondelicesetsaveurs-nancy.fr/espace-exposants/")["extracted"]
    assert ex["locality"] == "Vandœuvre-lès-Nancy"


# ---------------------------------------------------------------- resolver: corrections reach existing opportunities
def _upsert_twice(tmp_path, url, first, second):
    conn = dbm.connect(tmp_path / "t.sqlite")
    r = Resolver(conn, 1)
    uid = Frontier(conn, 1).add(url, "candidate", "test")
    a1 = _cls(SAINT_M, url)
    a1["extracted"].update(first)
    oid, _ = r.upsert(uid, url, 1, a1)
    a2 = json.loads(json.dumps(a1))
    a2["extracted"].update(second)
    r.upsert(uid, url, 2, a2)
    return dict(conn.execute("SELECT * FROM opportunities WHERE id=?", (oid,)).fetchone())


def test_site_title_name_is_replaced_by_the_corrected_event_name(tmp_path):
    o = _upsert_twice(tmp_path, "https://www.saint-marcellin.fr/inscriptions-au-marche-de-noel-2026/",
                      {"name": "Saint Marcellin, site officiel de la ville", "start_date": "2026-12-19"},
                      {"name": "Marché de Noël 2026", "start_date": "2026-12-19"})
    assert o["name"] == "Marché de Noël 2026"


def test_platform_organiser_and_region_are_corrected_on_refresh(tmp_path):
    o = _upsert_twice(tmp_path, "https://www.salon-cheval-angers.com/exposer/",
                      {"name": "Salon du Cheval d'Angers", "organiser": "Google Docs", "region": "Bretagne", "locality": None},
                      {"name": "Salon du Cheval d'Angers 2026", "organiser": "Les Garennes", "region": "Pays de la Loire",
                       "locality": "Angers"})
    assert (o["organiser"], o["region"], o["locality"]) == ("Les Garennes", "Pays de la Loire", "Angers")


# ---------------------------------------------------------------- UK-only crawl slot (21 Oct)
def test_country_crawl_slot_leases_only_that_countrys_urls(tmp_path):
    conn = dbm.connect(tmp_path / "t.sqlite")
    fr = Frontier(conn, 1)
    fr.add("https://www.bramleyfair.co.uk/traders", "candidate", "wikidata")                 # .uk host
    fr.add("https://localstalls.com/uk/event/x/1", "candidate", "platform:localstalls", meta={"country": "GB"})
    fr.ensure_site("craftfairexample.com", "organiser:x", country="GB")
    fr.add("https://craftfairexample.com/stalls", "candidate", "organiser:x")                # site hint GB
    fr.add("https://localstalls.com/au/event/y/2", "candidate", "platform:localstalls", meta={"country": "AU"})
    fr.add("https://www.eventeny.com/events/vendor/?id=9", "candidate", "platform:eventeny")
    fr.country = "GB"
    assert fr.pending_count() == 3
    got = {u["url"] for u in fr.next_batch(10, lambda h: 0.0, max_per_host=5)}
    assert len(got) == 3 and all(".uk" in u or "/uk/" in u or "craftfairexample.com" in u for u in got)
    assert Frontier(conn, 1).pending_count() == 2  # the AU and US pages are left for the shared crawl
