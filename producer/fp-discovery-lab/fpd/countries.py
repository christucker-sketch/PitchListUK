"""Country profiles.

Adding a country = adding one CountryProfile entry. Everything country-specific
(TLDs, postcode formats, regions, currency, phone codes, Wikidata/OSM ids and the
local vocabulary traders use) lives here so the rest of the engine stays generic.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CountryProfile:
    code: str                 # ISO 3166-1 alpha-2
    name: str
    wikidata_qid: str
    osm_area_iso: str         # ISO3166-1 code used by Overpass area lookup
    tlds: tuple[str, ...]     # registrable suffixes that strongly imply the country
    currency_markers: tuple[str, ...]
    phone_prefixes: tuple[str, ...]
    postcode_re: str          # regex for a postcode in free text
    regions: tuple[str, ...]  # states / provinces / counties / nations
    region_abbrevs: dict = field(default_factory=dict)
    # Search-query vocabulary (only used by optional search-API generator)
    trader_terms: tuple[str, ...] = ()


UK_COUNTIES = (
    "England", "Scotland", "Wales", "Northern Ireland",
    "Bedfordshire", "Berkshire", "Bristol", "Buckinghamshire", "Cambridgeshire", "Cheshire",
    "Cornwall", "Cumbria", "Derbyshire", "Devon", "Dorset", "Durham", "East Sussex", "Essex",
    "Gloucestershire", "Greater London", "London", "Greater Manchester", "Manchester", "Hampshire",
    "Herefordshire", "Hertfordshire", "Isle of Wight", "Kent", "Lancashire", "Leicestershire",
    "Lincolnshire", "Merseyside", "Liverpool", "Norfolk", "North Yorkshire", "Northamptonshire",
    "Northumberland", "Nottinghamshire", "Oxfordshire", "Rutland", "Shropshire", "Somerset",
    "South Yorkshire", "Staffordshire", "Suffolk", "Surrey", "Tyne and Wear", "Warwickshire",
    "West Midlands", "Birmingham", "West Sussex", "West Yorkshire", "Yorkshire", "Wiltshire",
    "Worcestershire", "East Riding of Yorkshire", "Aberdeenshire", "Highland", "Fife", "Edinburgh",
    "Glasgow", "Perthshire", "Argyll", "Ayrshire", "Dumfries", "Borders", "Lothian", "Cardiff",
    "Swansea", "Gwynedd", "Powys", "Pembrokeshire", "Carmarthenshire", "Ceredigion", "Monmouthshire",
    "Conwy", "Denbighshire", "Anglesey", "Belfast", "Antrim", "Down", "Armagh", "Tyrone",
    "Fermanagh", "Londonderry",
)

US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana",
    "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "DC": "District of Columbia",
}

CA_PROVINCES = {
    "AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador", "NS": "Nova Scotia", "NT": "Northwest Territories",
    "NU": "Nunavut", "ON": "Ontario", "PE": "Prince Edward Island", "QC": "Quebec",
    "SK": "Saskatchewan", "YT": "Yukon",
}

AU_STATES = {
    "NSW": "New South Wales", "VIC": "Victoria", "QLD": "Queensland", "WA": "Western Australia",
    "SA": "South Australia", "TAS": "Tasmania", "ACT": "Australian Capital Territory",
    "NT": "Northern Territory",
}

NZ_REGIONS = (
    "Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne", "Hawke's Bay", "Taranaki",
    "Manawatu", "Whanganui", "Wellington", "Tasman", "Nelson", "Marlborough", "West Coast",
    "Canterbury", "Otago", "Southland", "Christchurch", "Dunedin", "Queenstown", "Hamilton",
    "Tauranga", "Napier", "Hastings", "Rotorua", "Whangarei", "Wairarapa", "Coromandel",
)

IE_COUNTIES = (
    "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry", "Kildare",
    "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan",
    "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford", "Westmeath", "Wexford", "Wicklow",
)

COUNTRIES: dict[str, CountryProfile] = {
    "GB": CountryProfile(
        code="GB", name="United Kingdom", wikidata_qid="Q145", osm_area_iso="GB",
        tlds=("uk", "co.uk", "org.uk", "gov.uk", "ac.uk", "scot", "wales", "cymru", "london"),
        currency_markers=("£", "GBP"),
        phone_prefixes=("+44",),
        postcode_re=r"\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b",
        regions=UK_COUNTIES,
        trader_terms=("trader application", "stallholder application", "trade stand booking",
                      "food traders wanted", "apply to trade", "craft fair stallholders"),
    ),
    "US": CountryProfile(
        code="US", name="United States", wikidata_qid="Q30", osm_area_iso="US",
        tlds=("us",),
        currency_markers=("US$", "USD"),
        phone_prefixes=("+1",),
        postcode_re=r"\b(?:" + "|".join(US_STATES) + r")\s+\d{5}(?:-\d{4})?\b",
        regions=tuple(US_STATES.values()),
        region_abbrevs=US_STATES,
        trader_terms=("vendor application", "craft vendor application", "food vendor application",
                      "booth application", "call for vendors", "become a vendor"),
    ),
    "CA": CountryProfile(
        code="CA", name="Canada", wikidata_qid="Q16", osm_area_iso="CA",
        tlds=("ca",),
        currency_markers=("CA$", "C$", "CAD"),
        phone_prefixes=("+1",),
        postcode_re=r"\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d\b",
        regions=tuple(CA_PROVINCES.values()),
        region_abbrevs=CA_PROVINCES,
        trader_terms=("vendor application", "artisan application", "food vendor application",
                      "exhibitor application", "become a vendor"),
    ),
    "AU": CountryProfile(
        code="AU", name="Australia", wikidata_qid="Q408", osm_area_iso="AU",
        tlds=("au", "com.au", "org.au", "net.au", "gov.au", "asn.au", "edu.au"),
        currency_markers=("A$", "AUD"),
        phone_prefixes=("+61",),
        postcode_re=r"\b(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4}\b",
        regions=tuple(AU_STATES.values()),
        region_abbrevs=AU_STATES,
        trader_terms=("stallholder application", "stall holder application", "food vendor application",
                      "trade site application", "exhibitor application", "become a stallholder"),
    ),
    "NZ": CountryProfile(
        code="NZ", name="New Zealand", wikidata_qid="Q664", osm_area_iso="NZ",
        tlds=("nz", "co.nz", "org.nz", "govt.nz", "net.nz", "ac.nz", "school.nz", "kiwi.nz"),
        currency_markers=("NZ$", "NZD"),
        phone_prefixes=("+64",),
        postcode_re=r"\b(?:" + "|".join(re.escape(r) for r in NZ_REGIONS) + r")\s+\d{4}\b",
        regions=NZ_REGIONS,
        trader_terms=("stallholder application", "trade site application", "food vendor application",
                      "exhibitor application", "market stall booking"),
    ),
    "IE": CountryProfile(
        code="IE", name="Ireland", wikidata_qid="Q27", osm_area_iso="IE",
        tlds=("ie",),
        currency_markers=("€", "EUR"),
        phone_prefixes=("+353",),
        postcode_re=r"\b[AC-FHKNPRTV-Y]\d{2}(?:\s?[AC-FHKNPRTV-Y0-9]{4})\b|\bD6W\s?[AC-FHKNPRTV-Y0-9]{4}\b",
        regions=IE_COUNTIES,
        trader_terms=("trader application", "stallholder application", "trade stand application",
                      "food vendor application", "craft fair stall"),
    ),
}

IN_SCOPE = tuple(COUNTRIES)


def tld_country(suffix: str) -> str | None:
    """Map a public suffix (e.g. 'co.uk', 'com.au') to a country code, if unambiguous."""
    suffix = (suffix or "").lower()
    for code, prof in COUNTRIES.items():
        if suffix in prof.tlds:
            return code
        # catch e.g. 'nsw.gov.au', 'qld.gov.au', 'kent.sch.uk'
        if any(suffix.endswith("." + t) for t in prof.tlds if "." in t or len(t) == 2):
            return code
    return None


# Countries we explicitly recognise as OUT of scope, so a page clearly located there is rejected
# rather than left uncertain. Minimal list of strong signals.
OUT_OF_SCOPE_TLDS = {
    "de", "fr", "es", "it", "nl", "be", "ch", "at", "se", "no", "dk", "fi", "pl", "pt", "cz",
    "za", "in", "sg", "my", "ph", "jp", "cn", "hk", "br", "mx", "ar", "ae", "ng", "ke",
}
