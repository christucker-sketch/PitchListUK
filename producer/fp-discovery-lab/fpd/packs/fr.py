"""France (fr-FR) pack: trader/exhibitor vocabulary, dates, geography and scope rules.

Built from real pages seen in the 14 Oct 2026 France census (DATAtourisme organiser sites: Seyssins, Val-de-Moder,
Pluneret, Gex, Steinseltz, Ornans, Valence) and the probe-4 listing texts. Vocabulary is deliberately specific
(accented French words, French phrase shapes) so it cannot fire on English pages.

Scope (Chris, 14 Oct 2026): marchés de Noël, artisan/creator markets, producer markets, foires and salons with
exhibitor intake are in scope; brocantes / vide-greniers / braderies only when professionals are explicitly allowed.
"""
from __future__ import annotations

import re

A = r"['’]"          # apostrophe, straight or typographic
E = r"[ée]"          # e with or without acute accent (sites are inconsistent)

ROLE_WORDS = (r"exposants?|exposantes?|artisans?|cr" + E + r"ateurs?|cr" + E + r"atrices?|commer[cç]ants?|"
              r"producteurs?|productrices?|marchands?|brocanteurs?|forains?|camelots?|bouquinistes?|"
              r"antiquaires?|food[\s-]?trucks?")

MONTHS_FR = {
    "janvier": 1, "janv": 1, "février": 2, "fevrier": 2, "févr": 2, "fevr": 2, "mars": 3, "avril": 4, "avr": 4,
    "mai": 5, "juin": 6, "juillet": 7, "juil": 7, "août": 8, "aout": 8, "septembre": 9, "sept": 9,
    "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12, "déc": 12,
}
# Only spellings that are not also English month words/abbreviations ("Sept", "Dec"), so an English page never
# goes through the French date path (classifier-diff on the Pi, 14 Oct: "1 Sept" took a wider year window).
MONTH_FR_RE = (r"(janvier|janv\.|f[ée]vrier|f[ée]vr\.|mars|avril|avr\.|mai|juin|juillet|juil\.|ao[uû]t|"
               r"septembre|octobre|novembre|d[ée]cembre|déc\.)")
WEEKDAY_FR = r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)"

# Postcode followed by a commune name: "26000 Valence", "67150 Hipsheim", "01170 GEX", "F-75001 Paris".
_CONNECT = r"(?:de|du|des|en|sur|sous|l[eè]s|le|la|les|et|aux?|d['’])"
# Same line only ("20111\nGo" on a US listing is a ZIP followed by a button, not "20111 Go").
POSTCODE_COMMUNE = (r"\b(?:F-)?((?:0[1-9]|[1-8]\d|9[0-5]|2[AB])\d{3}|97[1-6]\d{2})[ \t\u00a0]+"
                    r"((?:(?:Saint|Sainte|St|Ste|Le|La|Les|L['’])[ \u00a0]?)?[A-ZÀ-Ý][A-Za-zÀ-ÿŒœÆæ'’\-]+(?:[ \u00a0]" + _CONNECT +
                    r"[ \u00a0]?[A-ZÀ-Ýa-zà-ÿŒœÆæ][A-Za-zÀ-ÿŒœÆæ'’\-]+){0,2})")
# French function words: postcode / phone / "France" only count as French evidence on a French-language page.
FRENCH_TEXT = r"\b(?:le|la|les|des|du|et|pour|avec|une|est|vous|nous|sur|dans|aux|au|votre|vos|ou|sont)\b"
PHONE_FR = r"(?<![\d+])(?:\+33\s?\(?0?\)?\s?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}(?!\d)"

# ISO 3166-2:FR regions (2016) and the départements in each (by postcode prefix).
REGIONS = {
    "FR-ARA": ("Auvergne-Rhône-Alpes", "01 03 07 15 26 38 42 43 63 69 73 74"),
    "FR-BFC": ("Bourgogne-Franche-Comté", "21 25 39 58 70 71 89 90"),
    "FR-BRE": ("Bretagne", "22 29 35 56"),
    "FR-CVL": ("Centre-Val de Loire", "18 28 36 37 41 45"),
    "FR-20R": ("Corse", "20 2A 2B"),
    "FR-GES": ("Grand Est", "08 10 51 52 54 55 57 67 68 88"),
    "FR-HDF": ("Hauts-de-France", "02 59 60 62 80"),
    "FR-IDF": ("Île-de-France", "75 77 78 91 92 93 94 95"),
    "FR-NOR": ("Normandie", "14 27 50 61 76"),
    "FR-NAQ": ("Nouvelle-Aquitaine", "16 17 19 23 24 33 40 47 64 79 86 87"),
    "FR-OCC": ("Occitanie", "09 11 12 30 31 32 34 46 48 65 66 81 82"),
    "FR-PDL": ("Pays de la Loire", "44 49 53 72 85"),
    "FR-PAC": ("Provence-Alpes-Côte d'Azur", "04 05 06 13 83 84"),
    "FR-GP": ("Guadeloupe", "971"), "FR-MQ": ("Martinique", "972"), "FR-GF": ("Guyane", "973"),
    "FR-RE": ("La Réunion", "974"), "FR-YT": ("Mayotte", "976"),
}
_DEPT_REGION = {d: code for code, (_, deps) in REGIONS.items() for d in deps.split()}


def region_of_postcode(pc: str | None) -> tuple[str, str] | None:
    """('FR-BRE', 'Bretagne') for a French postcode, from its département prefix; None if not French."""
    pc = (pc or "").strip().upper().removeprefix("F-")
    if len(pc) != 5:
        return None
    code = _DEPT_REGION.get(pc[:3]) or _DEPT_REGION.get(pc[:2])
    return (code, REGIONS[code][0]) if code else None


_PART = r"(?:" + ROLE_WORDS + r")"

PACK = {
    "name": "fr",
    "country": "FR",
    "role": [ROLE_WORDS],
    # Participation language (tier 1): somebody is being asked to apply/book/register as a trader.
    "strong_apply": [
        r"\b(?:inscriptions?|candidatures?|r" + E + r"servations?|demandes?\s+d" + A + r"(?:emplacement|inscription)|"
        r"(?:dossiers?|bulletins?|formulaires?|fiches?)\s+d" + A + r"(?:inscription|candidature))\s+"
        r"(?:des\s+|pour\s+les\s+|aux\s+|d" + A + r"|de\s+)?(?:nouveaux\s+)?" + _PART + r"\b",
        r"\b" + _PART + r"\s*:\s*(?:inscriptions?|candidatures?|r" + E + r"servations?)\b",
        r"\bdevenir\s+(?:exposant|exposante|commer[cç]ant|producteur|marchand|forain)\b",
        r"\b(?:vous\s+souhaitez|vous\s+voulez|envie\s+d" + A + r"|pour)\s+exposer\b",
        r"\bexposer\s+(?:au|à|a|sur|lors\s+d[eu]|vos\s+(?:cr" + E + r"ations|produits))\b",
        r"\bappels?\s+(?:à|a)\s+(?:candidatures?|projets?)\b[^.\n]{0,90}\b(?:march" + E + r"|exposants?|artisans?|"
        r"cr" + E + r"ateurs?|no[ëe]l|foire|salon|stands?|chalets?)",
        r"\b(?:march" + E + r"|no[ëe]l|foire|salon|exposants?|artisans?|cr" + E + r"ateurs?)\b[^.\n]{0,60}\bappels?\s+(?:à|a)\s+candidatures?\b",
        r"\bappels?\s+(?:à|a|aux)\s+(?:exposants?|artisans?|cr" + E + r"ateurs?|producteurs?|commer[cç]ants?)\b",
        r"\br" + E + r"serv(?:ez|er|ation)\s+(?:de\s+|d" + A + r"un\s+|votre\s+|un\s+|des\s+|les\s+|vos\s+)?"
        r"(?:emplacements?|stands?|chalets?|places?\s+(?:d" + A + r")?exposants?)\b",
        r"\b(?:vous\s+[êe]tes|si\s+vous\s+[êe]tes)\s+(?:un\s+|une\s+)?(?:" + ROLE_WORDS + r")[^.?\n]{0,80}"
        r"(?:rejoignez|inscri|candidat|postuler|participer|exposer|contactez)",
        r"\bcomment\s+(?:postuler|participer|s" + A + r"inscrire|candidater)\b",
        r"\b(?:" + ROLE_WORDS + r")\s+(?:recherch" + E + r"s?|bienvenus?|wanted)\b|\bnous\s+recherchons\s+(?:des\s+)?(?:"
        + ROLE_WORDS + r")\b",
        r"\b(?:tarifs?|prix|droits?)\s+(?:des\s+|de\s+l" + A + r"|d" + A + r"un\s+|du\s+)?(?:emplacements?|exposants?|stands?|chalets?)\b",
        r"\b\d+(?:[,.]\d+)?\s*(?:€|euros?)\s*(?:le|du|par|/)\s*(?:m[eè]tre(?:\s+lin" + E + r"aire)?|ml\b|m\b|stand|emplacement|table)",
        r"\bcommer[cç]ants?\s+non[\s-]s" + E + r"dentaires?\b",
        r"\binscriptions?\s+(?:des\s+)?(?:exposants?\s+)?(?:au|:)\s*(?:\+33|0[1-9])",
        r"\b(?:placier|droits?\s+de\s+place)\b",
    ],
    # Topical (tier 2): attendee-facing mentions that need corroboration ("plus de 90 exposants").
    "strong_topic": [
        r"\b(?:nombreux|plus\s+de\s+\d+|pas\s+moins\s+de\s+\d+|une?\s+\w+\s+d" + A + r"|\d+)\s+exposants\b",
        r"\bstands?\s+(?:d" + A + r"artisans|de\s+cr" + E + r"ateurs|de\s+producteurs)\b",
        r"\bmarch" + E + r"\s+(?:artisanal|des\s+cr" + E + r"ateurs|de\s+cr" + E + r"ateurs|de\s+producteurs|des\s+producteurs|nocturne)\b",
    ],
    "weak": [
        r"\bexposants?\b", r"\bemplacements?\b", r"\bstands?\b", r"\bchalets?\b", r"\bartisans?\b",
        r"\bcr" + E + r"ateurs?\b", r"\bproducteurs?\b", r"\bm[eè]tres?\s+lin" + E + r"aires?\b",
        r"\bresponsabilit" + E + r"\s+civile\b", r"\bk-?bis\b", r"\bsiret\b", r"\bregistre\s+du\s+commerce\b",
        r"\battestation\s+d" + A + r"assurance\b", r"\btonnelles?\b", r"\bbarnums?\b",
    ],
    "event_types": {
        "christmas_market": r"\bmarch" + E + r"s?\s+de\s+no[ëe]l\b|\bvillage\s+de\s+no[ëe]l\b|\bmarch" + E + r"\s+(?:de\s+l" + A + r"avent|d" + A + r"hiver)\b",
        "craft_fair": r"\bmarch" + E + r"s?\s+(?:artisanal|artisanaux|des\s+(?:artisans|cr" + E + r"ateurs)|de\s+cr" + E + r"ateurs|d" + A + r"art)\b|"
                      r"\bsalon\s+(?:des\s+)?(?:m" + E + r"tiers\s+d" + A + r"art|cr" + E + r"ateurs|artisans)\b|\bf[êe]te\s+de\s+l" + A + r"artisanat\b",
        "farmers_market": r"\bmarch" + E + r"s?\s+(?:de\s+producteurs|des\s+producteurs|paysans?|fermiers?|du\s+terroir|bio)\b",
        "food_festival": r"\bmarch" + E + r"\s+gourmand\b|\bfestival\s+gourmand\b|\bf[êe]te\s+de\s+la\s+gastronomie\b",
        "agricultural_show": r"\bfoire\s+agricole\b|\bcomice\s+agricole\b",
        "market": r"\bmarch" + E + r"s?\s+(?:hebdomadaire|nocturne|du\s+\w+|de\s+\w+)\b|\bbrocantes?\b|\bvide[\s-]greniers?\b|\bbraderies?\b|\bpuces\b",
        "fair_fete": r"\bfoires?\b|\bf[êe]te\s+(?:de\s+village|patronale|locale|des\s+\w+)\b",
        "exhibition": r"\bsalons?\b|\bexpositions?\b",
    },
    "trader_types": {
        "food": r"\b(?:restauration|traiteurs?|food[\s-]?trucks?|produits?\s+du\s+terroir|m" + E + r"tiers\s+de\s+bouche|alimentaire|gastronomie)\b",
        "craft": r"\b(?:artisans?|artisanat|cr" + E + r"ateurs?|cr" + E + r"atrices?|fait\s+main|savoir-faire)\b",
        "art": r"\b(?:artistes?|peintres?|sculpteurs?|plasticiens?)\b",
        "produce": r"\b(?:producteurs?\s+locaux|mara[îi]chers?|fermiers?|viticulteurs?|apiculteurs?)\b",
        "retail": r"\b(?:commer[cç]ants?|marchands?|brocanteurs?|antiquaires?|bouquinistes?)\b",
        "exhibitor": r"\bexposants?\b",
        "nonprofit": r"\bassociations?\b",
    },
    "negatives": {
        # In French a 'marché public' is a public procurement contract, not a market (and Gex lists its tenders
        # under "Appels à candidatures").
        # (not bare 'marchés publics': in Québec that is a public MARKET, e.g. Marchés publics de Montréal)
        "procurement": r"\bappels?\s+d" + A + r"offres?\b|\bconsultations?\s+des\s+entreprises\b|"
                       r"\bpouvoir\s+adjudicateur\b|\bavis\s+d" + A + r"appel\s+public\b|\bacheteur\s+public\b|\bboamp\b|\bdce\b",
        "jobs": r"\boffres?\s+d" + A + r"emploi\b|\brecrutement\b|\bforum\s+(?:de\s+l" + A + r")?emploi\b|\bcandidature\s+spontan" + E + r"e\b|"
                r"\bjob\s*dating\b|\balternance\b|\bfrance\s+travail\b",
        "volunteer_only": r"\bb" + E + r"n" + E + r"voles?\s+(?:recherch|inscri)",
        "real_estate": r"\blocal\s+commercial\s+(?:à|a)\s+louer\b|\bbail\s+(?:commercial|rural|à\s+clauses)\b|\bcession\s+de\s+fonds\b",
        "fixed_concession": r"\bterrasses?\s+(?:de\s+caf" + E + r"|commerciales?)\b|\boccupation\s+du\s+domaine\s+public\s+(?:pour|des)\s+terrasses?\b",
        "agriculture_tenancy": r"\b" + E + r"leveurs?\b[^.\n]{0,80}\b(?:parcelles?|bail|convention\s+de\s+gestion)\b|\bassociation\s+fonci[eè]re\s+pastorale\b",
    },
    "closed": [
        r"\b(?:inscriptions?|candidatures?|r" + E + r"servations?)\s+(?:sont\s+|est\s+)?(?:d" + E + r"sormais\s+|maintenant\s+|actuellement\s+)?"
        r"(?:closes?|cl[ôo]tur" + E + r"es?|ferm" + E + r"es?|termin" + E + r"es?)\b",
        r"\b(?:le\s+march" + E + r"|les\s+emplacements|les\s+stands|les\s+inscriptions)\s+(?:est|sont)\s+(?:d" + E + r"j[àa]\s+)?complets?\b",
        r"\bcomplet\s+pour\s+(?:les\s+)?exposants\b|\bnous\s+(?:sommes|affichons)\s+complets?\b",
        r"\bvotre\s+demande\s+(?:est|sera)\s+plac" + E + r"e\s+sur\s+(?:notre\s+|la\s+)?liste\s+d" + A + r"attente\b",
        r"\bplus\s+(?:aucune?\s+)?(?:de\s+)?(?:places?|emplacements?|stands?)\s+disponibles?\b",
    ],
    "not_yet": [
        r"\binscriptions?\s+(?:ouvriront|s" + A + r"ouvriront|seront\s+ouvertes|ouvrent)\b",
        r"\bouverture\s+des\s+(?:inscriptions|candidatures)\s+(?:le|en|à\s+partir\s+d[ue]|d[eè]s|prochainement)\b",
        r"\b(?:inscriptions?|candidatures?)\s+(?:à\s+venir|prochainement)\b",
    ],
    "open": [
        r"\b(?:inscriptions?|candidatures?|r" + E + r"servations?)\s+(?:sont\s+|est\s+)?(?:ouvertes?|en\s+cours)\b(?!\s+(?:le|à\s+partir|d[eè]s|en\s+\w+\s+20))",
        r"\bil\s+reste\s+(?:encore\s+)?des\s+(?:places|emplacements|stands)\b",
        r"\b(?:exposants?|artisans?|cr" + E + r"ateurs?|producteurs?)\s+recherch" + E + r"s\b",
        # 21 Oct (Kilstett): "Appel aux exposants", "La Commune recherche des créateurs, artisans" are the call itself.
        r"\bappel\s+(?:aux|[àa])\s+(?:exposants|candidatures|artisans|cr" + E + r"ateurs|commer[cç]ants|producteurs)\b",
        r"\b(?:recherche|recherchons|cherche|cherchons)\s+(?:encore\s+)?(?:des|de\s+nouveaux|d" + A + r"autres)\s+"
        r"(?:exposants|artisans|cr" + E + r"ateurs|producteurs|commer[cç]ants)\b",
    ],
    "recurrence": [
        r"\b(?:tous\s+les|chaque)\s+(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?|week-?ends?|mois)\b",
        r"\b(?:tous\s+les|chaque)\s+(?:premiers?|deuxi[eè]mes?|troisi[eè]mes?|quatri[eè]mes?|derniers?|1ers?|2[eè]?mes?|3[eè]?mes?)\s+"
        r"(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)\s+du\s+mois\b",
        r"\bmarch" + E + r"\s+hebdomadaire\b",
    ],
    "deadline_cue": [
        r"date\s+limite(?:\s+d" + A + r"(?:inscription|envoi|d" + E + r"p[oô]t|retour))?|avant\s+le|au\s+plus\s+tard\s+le|"
        r"cl[ôo]ture\s+des\s+(?:inscriptions|candidatures)|retour\s+des\s+(?:dossiers|bulletins)|"
        r"inscriptions?\s+(?:possibles?\s+)?jusqu" + A + r"au",
    ],
    "link_strong": [
        r"exposant|exposer|devenir[\s_-]exposant|candidature|inscription[\s_-]+(?:des[\s_-]+)?(?:exposants?|march|brocante|vide)|"
        r"emplacement|commer[cç]ants?[\s_-]non|placier|droits?[\s_-]de[\s_-]place|marche[\s_-]de[\s_-]noel|march" + E + r"[\s_-]de[\s_-]no[ëe]l",
    ],
    "link_medium": [
        r"inscri|r" + E + r"serv|formulaire|t" + E + r"l" + E + r"charg|documents?|march" + E + r"s?|marches?|animations?|"
        + E + r"v" + E + r"nements?|agenda|f[êe]tes?|vie[\s_-]?(?:locale|associative|" + E + r"conomique)|commerces?|associations?",
    ],
    "link_negative": [
        r"mentions[\s_-]l" + E + r"gales|confidentialit|connexion|panier|billetterie|recrutement|emploi|"
        r"urbanisme|" + E + r"tat[\s_-]civil|cimeti[eè]re|d" + E + r"ch[eè]ts|cantine|scolaire|periscolaire|p" + E + r"riscolaire|"
        r"march" + E + r"s[\s_-]publics|marches[\s_-]publics|appels?[\s_-]d[\s_-]?offres",
    ],
    "non_vendor_anchor": [
        r"b" + E + r"n" + E + r"voles?|billets?|billetterie|lettre\s+d" + A + r"information|dons?\b|concours|spectacles?|"
        r"r" + E + r"servation\s+(?:de\s+)?(?:salle|repas|table\s+au\s+repas)|emploi|recrutement|stages?\b|scolaire",
    ],
    "apply_anchor": [
        r"inscri|candidat|postuler|r" + E + r"serv(?:er|ez|ation)\s+(?:un\s+|votre\s+)?(?:emplacement|stand|chalet|table)|"
        r"formulaire|bulletin|dossier|t" + E + r"l" + E + r"charger|participer|exposer",
    ],
    "form_doc_name": [r"inscription|candidature|bulletin|dossier|formulaire|exposant|emplacement"],  # not 'règlement' (rules)
    "platforms": {"helloasso.com": "HelloAsso", "billetweb.fr": "Billetweb", "weezevent.com": "Weezevent"},
    # Used for both tickets and exhibitor bookings: a route only when the link itself is about exhibiting.
    "ticketing_only": ["HelloAsso", "Billetweb", "Weezevent"],
    # Phone/email booking instruction in text ("Inscriptions exposants au 06 12 34 56 78").
    "contact_instruction": [
        r"(?:inscriptions?|r" + E + r"servations?|renseignements?\s+et\s+inscriptions?|pour\s+exposer|candidatures?|"
        r"dossiers?\s+de\s+candidature|r" + E + r"servation\s+des\s+emplacements)[^.\n]{0,60}?(?:au|:|aupr[eè]s\s+d[eu]|par\s+t" + E + r"l" + E + r"phone|"
        r"par\s+mail|à\s+l" + A + r"adresse)[^.\n]{0,40}?(?:" + PHONE_FR + r"|[\w.+-]+@[\w-]+\.[\w.-]+)",
    ],
    # state.py: route categories (anchor/url words), merged into the English categories of the same name.
    "route_categories": {
        "food": r"\b(?:restauration|alimentaire|m" + E + r"tiers\s+de\s+bouche|food[\s-]?trucks?|buvette)\b",
        "craft": r"\b(?:artisan\w*|cr" + E + r"at(?:eur|rice)s?)\b",
        "exhibitor": r"\b(?:exposants?|stands?|emplacements?|chalets?)\b",
        "produce": r"\b(?:producteurs?|paysans?|fermiers?)\b",
        "retail": r"\b(?:commer[cç]ants?|marchands?|brocanteurs?|march" + E + r"s?|marche(?:de|s)?\w*|no[ëe]l\w*|foires?|salons?)",
    },
    "opens_on": [
        r"(?:inscriptions?|candidatures?|r" + E + r"servations?)\s+(?:seront\s+)?(?:ouvertes?|ouvriront|s" + A + r"ouvriront|ouvrent)\s+"
        r"(?:le|à\s+partir\s+d[ue]|d[eè]s\s+le|en|au)?\s*([^.\n]{0,40})",
        r"ouverture\s+des\s+(?:inscriptions|candidatures)\s+(?:le|à\s+partir\s+d[ue]|d[eè]s\s+le|en)?\s*([^.\n]{0,40})",
    ],
    # A page or JSON-LD event whose title is the trader call itself, not the event ("[jusqu'au 20 novembre] Réservez
    # votre stand au Marché de Noël 2026 !", "Inscriptions au marché de Noël 2026"): its dates can be the application
    # window, and its title needs the call wording removed to name the event.
    "application_call": [
        r"\br" + E + r"servez\s+votre\s+(?:stand|emplacement|place|table)\b",
        r"\b(?:inscriptions?|candidatures?)\s+(?:des\s+|pour\s+les\s+)?(?:exposants?|commer[cç]ants|artisans|cr" + E + r"ateurs)\b",
        r"^\s*(?:\[[^\]]{1,40}\]\s*)?inscriptions?\s+(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r"|pour\s+l[ea])\b",
        r"\bappel\s+(?:aux|[àa])\s+(?:exposants|candidatures)\b", r"\bdevenez\s+exposant\b",
        r"^\s*(?:exposer|devenir\s+exposant)\s+(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r")\s",
    ],
    "call_prefix": [
        r"r" + E + r"servez\s+votre\s+(?:stand|emplacement|place|table)\s+(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r"|pour\s+l[ea]|pour\s+les)\s*",
        r"inscriptions?\s+(?:des\s+exposants\s+)?(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r"|pour\s+l[ea]|pour\s+les)\s*",
        r"appel\s+(?:aux|[àa])\s+(?:exposants|candidatures)\s*(?:[:\-–]\s*|pour\s+(?:le|la|les|l" + A + r")\s*)?",
        r"(?:devenez|devenir)\s+exposant\s+(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r")\s*",
        r"exposer\s+(?:au|aux|[àa]\s+la|[àa]\s+l" + A + r")\s*",
    ],
    # "Plouarzel animation organisera son 24ème salon", "organisé par le Comité des fêtes de Hochstatt". Case-sensitive:
    # the organiser starts with a capital; sentence openers that are not names are refused in classify.
    "organiser_phrases": [
        r"(?:^|[\n.!?»:]\s*)([A-ZÀ-Ý][\w'’&\-]*(?:\s+(?:de|du|des|d['’]|la|le|les|et|&|[A-Za-zÀ-ÿ][\w'’&\-]*)){0,4})"
        r"\s+(?:organise|organisera|organisent|organiseront|vous\s+propose|propose)\s+(?:son|sa|ses|leur|le|la|les|un|une|cette|ce)\b",
        r"\borganis" + E + r"e?s?\s+par\s+(?:le\s+|la\s+|les\s+|l['’])?([A-ZÀ-Ý][\w'’&\-]*(?:\s+(?:de|du|des|d['’]|la|le|les|et|&|[A-ZÀ-Ý][\w'’&\-]*)){0,6})",
    ],
    "annual": [r"\b\d{1,3}\s*(?:e|è|ème|eme|ième|ieme)\s+" + E + r"dition\b|\bchaque\s+ann" + E + r"e\b|\btous\s+les\s+ans\b|\bannuel(?:le)?\b"],
    "recur_market": [
        r"\b(?:tous\s+les|chaque)\s+(?:lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?|week-?ends?|semaines?|mois)\b|"
        r"\bhebdomadaire\b|\bmensuel(?:le)?\b",
    ],
    # Off-topic French pages that carry participation words (first Pi run, 15 Oct: "la mairie recrute", a municipal-council
    # candidates call, a cultural-projects call, a shop-premises call). Checked against the page TITLE/H1 and URL PATH.
    "offtopic": r"recrut|offres?[\s_-]+d[\s_'’-]*emploi|\bemplois?\b|conseil[\s_-]+municipal|[ée]lections?|"
                r"appels?[\s_-]+[àa][\s_-]+projets?[\s_-]+culturels?|r[ée]sidences?[\s_-]+d[\s_'’-]*artistes?|"
                r"locaux?[\s_-]+commerciaux?|local[\s_-]+commercial|boutiques?[\s_-]+[àa][\s_-]+l[\s_'’-]*essai|"
                r"cellules?[\s_-]+commerciales?|bail[\s_-]+commercial|appel[\s_-]+[àa][\s_-]+candidatures?[\s_-]+commerces?\b|"
                r"stages?[\s_-]+(?:de|en)\b|service[\s_-]+civique|(?:/|^)commerce$",
    # Scope rule (brocantes / vide-greniers only when professionals may take part).
    "private_sellers_event": r"\b(?:brocantes?|vide[\s-]greniers?|braderies?|bourses?\s+aux\s+(?:jouets|v[êe]tements|livres)|troc)\b",
    "private_only": r"\br" + E + r"serv" + E + r"e?s?\s+aux\s+particuliers\b|\b(?:uniquement|exclusivement)\s+(?:pour\s+les\s+|aux\s+|des\s+)?particuliers\b|"
                    r"\bparticuliers\s+(?:uniquement|seulement)\b|\b(?:interdits?|ferm" + E + r"s?)\s+aux\s+professionnels\b|"
                    r"\bprofessionnels\s+(?:non\s+admis|interdits|exclus|non\s+autoris" + E + r"s)\b",
    "pro_allowed": r"\b(?:professionnels?\s+(?:et|ou)\s+(?:les\s+)?particuliers|particuliers\s+(?:et|ou)\s+(?:les\s+)?professionnels?)\b|"
                   r"\bprofessionnels?\s+(?:accept" + E + r"s|admis|bienvenus|autoris" + E + r"s)\b|\bouvert(?:e|es)?\s+aux\s+(?:professionnels|pros)\b|"
                   r"\bbrocanteurs?\s+professionnels?\b|\bantiquaires\b",
}


# ---------------------------------------------------------------------------------------------------------------
# Event-scoped commune -> département (21 Oct, Angers case). A region NAME found anywhere on a page is weak evidence
# (the Salon du Cheval d'Angers page quotes an exhibitor's "clients basés en Bretagne"), whereas the commune named in
# the event's own title or date sentence ("Parc des Expositions - Angers les 13, 14 et 15 novembre") is where it is.
# Préfectures plus large communes only, and only names that are not ordinary French words (no Tours, Sens, Vienne,
# Valence, Gap). classify() looks these up after a preposition/dash, case-sensitively, in the event name and date
# sentence only -- never in the whole page.
FR_COMMUNES = {
    "Bourg-en-Bresse": "01", "Laon": "02", "Saint-Quentin": "02", "Soissons": "02", "Moulins": "03", "Vichy": "03",
    "Montluçon": "03", "Digne-les-Bains": "04", "Nice": "06", "Cannes": "06", "Antibes": "06", "Grasse": "06",
    "Menton": "06", "Privas": "07", "Annonay": "07", "Charleville-Mézières": "08", "Sedan": "08", "Foix": "09",
    "Pamiers": "09", "Troyes": "10", "Carcassonne": "11", "Narbonne": "11", "Rodez": "12", "Millau": "12",
    "Marseille": "13", "Aix-en-Provence": "13", "Arles": "13", "Martigues": "13", "Aubagne": "13", "Caen": "14",
    "Lisieux": "14", "Bayeux": "14", "Aurillac": "15", "Angoulême": "16", "Cognac": "16", "La Rochelle": "17",
    "Saintes": "17", "Rochefort": "17", "Royan": "17", "Bourges": "18", "Vierzon": "18", "Tulle": "19", "Brive-la-Gaillarde": "19",
    "Ajaccio": "2A", "Bastia": "2B", "Dijon": "21", "Beaune": "21", "Saint-Brieuc": "22", "Lannion": "22", "Dinan": "22",
    "Guéret": "23", "Périgueux": "24", "Bergerac": "24", "Sarlat-la-Canéda": "24", "Besançon": "25", "Montbéliard": "25",
    "Pontarlier": "25", "Montélimar": "26", "Romans-sur-Isère": "26", "Évreux": "27", "Vernon": "27", "Chartres": "28",
    "Dreux": "28", "Quimper": "29", "Brest": "29", "Morlaix": "29", "Concarneau": "29", "Nîmes": "30", "Alès": "30",
    "Toulouse": "31", "Auch": "32", "Bordeaux": "33", "Arcachon": "33", "Libourne": "33", "Mérignac": "33",
    "Montpellier": "34", "Béziers": "34", "Sète": "34", "Rennes": "35", "Saint-Malo": "35", "Fougères": "35",
    "Vitré": "35", "Châteauroux": "36", "Amboise": "37", "Chinon": "37", "Grenoble": "38", "Bourgoin-Jallieu": "38",
    "Voiron": "38", "Lons-le-Saunier": "39", "Dole": "39", "Mont-de-Marsan": "40", "Dax": "40", "Blois": "41",
    "Vendôme": "41", "Saint-Étienne": "42", "Roanne": "42", "Le Puy-en-Velay": "43", "Nantes": "44",
    "Saint-Nazaire": "44", "La Baule-Escoublac": "44", "Orléans": "45", "Montargis": "45", "Cahors": "46", "Agen": "47",
    "Mende": "48", "Angers": "49", "Cholet": "49", "Saumur": "49", "Saint-Lô": "50", "Cherbourg-en-Cotentin": "50",
    "Granville": "50", "Châlons-en-Champagne": "51", "Reims": "51", "Épernay": "51", "Chaumont": "52", "Langres": "52",
    "Laval": "53", "Nancy": "54", "Lunéville": "54", "Vandœuvre-lès-Nancy": "54", "Bar-le-Duc": "55", "Verdun": "55",
    "Vannes": "56", "Lorient": "56", "Metz": "57", "Thionville": "57", "Sarreguemines": "57", "Forbach": "57",
    "Nevers": "58", "Lille": "59", "Roubaix": "59", "Tourcoing": "59", "Dunkerque": "59", "Valenciennes": "59",
    "Douai": "59", "Beauvais": "60", "Compiègne": "60", "Alençon": "61", "Arras": "62", "Calais": "62",
    "Boulogne-sur-Mer": "62", "Lens": "62", "Clermont-Ferrand": "63", "Pau": "64", "Bayonne": "64", "Biarritz": "64",
    "Tarbes": "65", "Lourdes": "65", "Perpignan": "66", "Strasbourg": "67", "Haguenau": "67", "Sélestat": "67",
    "Colmar": "68", "Mulhouse": "68", "Lyon": "69", "Villeurbanne": "69", "Vesoul": "70", "Mâcon": "71",
    "Chalon-sur-Saône": "71", "Le Mans": "72", "Chambéry": "73", "Aix-les-Bains": "73", "Annecy": "74",
    "Annemasse": "74", "Thonon-les-Bains": "74", "Chamonix-Mont-Blanc": "74", "Paris": "75", "Rouen": "76",
    "Le Havre": "76", "Dieppe": "76", "Melun": "77", "Meaux": "77", "Fontainebleau": "77", "Versailles": "78",
    "Niort": "79", "Amiens": "80", "Abbeville": "80", "Albi": "81", "Castres": "81", "Montauban": "82", "Toulon": "83",
    "Fréjus": "83", "Hyères": "83", "Draguignan": "83", "Avignon": "84", "Carpentras": "84", "Orange": "84",
    "La Roche-sur-Yon": "85", "Les Sables-d'Olonne": "85", "Poitiers": "86", "Châtellerault": "86", "Limoges": "87",
    "Épinal": "88", "Auxerre": "89", "Belfort": "90", "Évry-Courcouronnes": "91", "Nanterre": "92", "Bobigny": "93",
    "Créteil": "94", "Cergy": "95",
}
_FR_COMMUNE_RE = re.compile(
    r"(?:\b(?:[àa]|de|au|sur|en)\s+|d['’]|[\-–—,]\s*)(" + "|".join(sorted((re.escape(c) for c in FR_COMMUNES), key=len, reverse=True))
    + r")(?![\w\-])")


def communes_in(text: str) -> list[tuple[str, str]]:
    """[(commune, département)] for listed communes named after a preposition, apostrophe or dash in `text`."""
    return [(m.group(1), FR_COMMUNES[m.group(1)]) for m in _FR_COMMUNE_RE.finditer(text or "")]


def region_of_department(dep: str) -> tuple[str, str] | None:
    code = _DEPT_REGION.get(dep)
    return (code, REGIONS[code][0]) if code else None
