"""Vocabulary and patterns that define what a trader opportunity *looks like*.

Kept in one place so classifier changes are reviewable and versioned (see CLASSIFIER_VERSION).
Regional vocabulary differs (UK 'stallholder'/'pitch'/'trade stand', US 'vendor'/'booth',
AU/NZ 'stallholder'/'site'), so the patterns are deliberately pan-anglophone.
"""
from __future__ import annotations

import re

CLASSIFIER_VERSION = "rules-v4-states"

# Who: the participant roles we care about.
ROLE = (
    r"(?:vendor|stall[\s-]?holder|stall[\s-]?keeper|trader|exhibitor|concessionaire|food[\s-]?concession|"
    r"concession[\s-]?(?:stand|stall|trailer|vendor|booth|space)|artisan|crafter|"
    r"maker|merchant|food[\s-]?truck|food[\s-]?van|street[\s-]?food|caterer|retailer|seller|stall|pitch|"
    r"booth|trade[\s-]?stand|tradestand|market[\s-]?stall|food[\s-]?vendor|craft[\s-]?vendor|"
    r"art(?:ist)?s?[\s-]?vendor|producer|grower)s?"
)

# Strong, specific phrasings: a page using one of these is almost certainly *about* trading at an event.
STRONG_PATTERNS = [
    rf"\b{ROLE}\s+(?:application|applications|registration|registrations|enquir(?:y|ies)|booking|bookings|"
    r"sign[\s-]?ups?|booking\s+form|application\s+form|information|info|pack|terms|opportunit(?:y|ies)|"
    r"wanted|needed|required|spaces?|fees?|pitches|criteria|guidelines|portal|prospectus|eoi|"
    r"expressions?\s+of\s+interest)\b",
    r"\b(?:become|apply\s+to\s+be|apply\s+as|register\s+as|sign\s+up\s+as|join\s+us\s+as|be)\s+an?\s+"
    rf"(?:{ROLE})\b",
    r"\b(?:apply|book|reserve|register|enquire)\s+(?:for\s+|to\s+book\s+)?(?:an?\s+|your\s+)?"
    r"(?:stall|pitch|booth|trade\s+stand|trading\s+space|trading\s+pitch|vendor\s+space|booth\s+space|"
    r"market\s+stall|trade\s+site|stand|vendor\s+table|table\s+space|gazebo\s+space)s?\b",
    r"\bcall\s+(?:for|to)\s+(?:vendors|artists|makers|traders|exhibitors|artisans|food\s+trucks|stallholders|crafters)\b",
    r"\b(?:apply\s+to\s+trade|trading\s+opportunit(?:y|ies)|trade\s+opportunit(?:y|ies)|"
    r"interested\s+in\s+(?:trading|having\s+a\s+stall|exhibiting|vending|being\s+a\s+vendor)|"
    r"want\s+to\s+(?:trade|exhibit|sell|have\s+a\s+stall)\s+at)\b",
    r"\b(?:now\s+)?(?:accepting|taking|inviting|welcoming|seeking|looking\s+for)\s+(?:new\s+)?(?:applications\s+from\s+)?"
    rf"(?:{ROLE})\b",
    r"\b(?:pitch|stall|booth|vendor|trade\s+stand|site)\s+(?:fee|fees|price|prices|rates|costs?|sizes?|allocation)\b",
    # --- round 2: regional vocabulary (UK/IE pitches & caterers, AU/NZ EOIs & sites, Quebec French) ---
    r"\bexpressions?\s+of\s+interest\b[^.\n]{0,60}\b(?:stall|stallholders?|vendors?|traders?|markets?|food|exhibit\w*|sites?)\b",
    r"\b(?:submit|start)\s+(?:an?\s+|your\s+)?(?:stallholder\s+|vendor\s+|trader\s+)?application\b",
    r"\b(?:catering|trading|trade|market)\s+pitch(?:es)?\b",
    r"\b(?:mobile\s+)?caterers?\s+(?:wanted|required|needed)\b|\bcatering\s+opportunit(?:y|ies)\b",
    r"\b(?:site|stall|pitch)\s+(?:applications?|bookings?|holders?)\b",
    r"\b(?:inscription|appel)\s+(?:des\s+|aux\s+)?(?:exposants|artisans|marchands)\b|\bdevenir\s+exposant\b",
    # --- topical tier from here ---
    r"\b(?:trade\s+stands?|tradestands?)\b",
    r"\bfood\s+(?:and\s+drink\s+)?(?:traders?|vendors?|stallholders?)\b",
    r"\bjuried\s+(?:art|craft|show|fair|festival)",
]
STRONG_RE = [re.compile(p, re.I) for p in STRONG_PATTERNS]
# Tier 1 = language about *participating* (apply/book/become/fees); tier 2 = topical mentions that also
# appear on attendee-facing pages ("30+ food vendors", "trade stands") and so need corroboration.
N_APPLY = 13  # number of participation-language patterns at the head of STRONG_PATTERNS
STRONG_APPLY_RE = STRONG_RE[:N_APPLY]
STRONG_TOPIC_RE = STRONG_RE[N_APPLY:]

# Weak: words consistent with the topic but common elsewhere.
WEAK_PATTERNS = [
    r"\bstallholders?\b", r"\bvendors?\b", r"\btraders?\b", r"\bexhibitors?\b", r"\bstalls?\b",
    r"\bpitch(?:es)?\b", r"\bbooths?\b", r"\bpublic\s+liability\b", r"\bfood\s+hygiene\s+rating\b",
    r"\bgazebo\b", r"\b10\s*[x×']\s*10\b", r"\b3\s*m?\s*[x×]\s*3\s*m\b", r"\belectric(?:ity|al)?\s+hook[\s-]?up\b",
    r"\binsurance\b", r"\bset[\s-]?up\b", r"\bload[\s-]?in\b", r"\bjuried\b", r"\bhandmade\b",
    r"\bcraft(?:s|ers)?\b", r"\bfarmers'?\s*market\b", r"\bfood\s+trucks?\b",
]
WEAK_RE = [re.compile(p, re.I) for p in WEAK_PATTERNS]

# What kind of event this is.
EVENT_TYPES = {
    "food_festival": r"\b(?:food|street\s+food|food\s+(?:and|&)\s+drink|chilli|cheese|beer|wine|cider|bbq|taste)\s+(?:festival|fest|fair|show)\b",
    "music_festival": r"\bmusic\s+festival\b|\bfestival\s+line[\s-]?up\b",
    "farmers_market": r"\bfarmers'?\s*markets?\b|\bproducers'?\s*markets?\b",
    "christmas_market": r"\b(?:christmas|xmas|festive|holiday|winter)\s+(?:market|fair|bazaar)s?\b",
    "craft_fair": r"\b(?:craft|arts?\s+(?:and|&)\s+crafts?|artisan|makers'?|handmade|art)\s+(?:fair|market|show|festival)s?\b",
    "agricultural_show": r"\b(?:county|agricultural|country|a\s*&\s*p|royal|state|show\s+society|ag)\s+(?:show|fair)s?\b",
    "street_festival": r"\bstreet\s+(?:festival|fair|party)\b",
    "fair_fete": r"\b(?:fete|fête|gala|carnival|fayre|jamboree)\b",
    "market": r"\b(?:market|markets|night\s+market|flea\s+market|car\s+boot|boot\s+sale|swap\s+meet|bazaar)\b",
    "festival": r"\bfestival\b|\bfest\b",
    "exhibition": r"\b(?:expo|exhibition|trade\s+show|convention|con\b|show\s+and\s+sale)\b",
    "sporting_event": r"\b(?:marathon|triathlon|race\s+day|horse\s+trials|regatta|tournament|grand\s+prix|rally)\b",
    "university_event": r"\b(?:freshers'?\s+(?:fair|week)|welcome\s+fair|student\s+union|students'?\s+union)\b",
    "cultural_event": r"\b(?:diwali|mela|pride|lunar\s+new\s+year|chinese\s+new\s+year|st\.?\s+patrick|caribbean|carnaval|heritage\s+festival|cultural\s+festival)\b",
}
EVENT_TYPES_RE = {k: re.compile(v, re.I) for k, v in EVENT_TYPES.items()}

TRADER_TYPES = {
    "food": r"\b(?:food|catering|caterer|street\s+food|food\s+trucks?|food\s+vans?|hot\s+food|coffee|bakery|drinks?\s+(?:vendor|trader)|bar\s+concession)\b",
    "craft": r"\b(?:craft|crafts|crafter|handmade|artisan|maker)s?\b",
    "art": r"\b(?:fine\s+art|artists?|juried\s+art|photography|painting|sculpture)\b",
    "produce": r"\b(?:produce|growers?|farmers?|fresh\s+fruit|vegetables|meat|eggs)\b",
    "retail": r"\b(?:retail|merchandise|commercial\s+vendor|general\s+goods|clothing|jewell?ery)\b",
    "exhibitor": r"\b(?:exhibitors?|trade\s+stands?|commercial\s+stands?|sponsor\s+booth)\b",
    "nonprofit": r"\b(?:non[\s-]?profit|charity|charities|community\s+groups?)\b",
}
TRADER_TYPES_RE = {k: re.compile(v, re.I) for k, v in TRADER_TYPES.items()}

# Things that use the same words but are NOT trading-at-events opportunities.
NEGATIVE_PATTERNS = {
    "procurement": r"\b(?:procurement|request\s+for\s+proposals?|rfp|rfq|invitation\s+to\s+bid|bid\s+opportunit|tender(?:s|ing)?\b|supplier\s+(?:portal|registration)|w-?9\b|accounts\s+payable|purchase\s+orders?|vendor\s+self[\s-]?service|e-?procurement|solicitation)",
    "jobs": r"\b(?:job\s+(?:application|vacanc)|careers?\s+at|we'?re\s+hiring|employment\s+application|apply\s+for\s+this\s+job)\b",
    "volunteer_only": r"\bvolunteer\s+(?:application|registration|sign[\s-]?up)\b",
    "ecommerce_seller": r"\b(?:sell\s+on\s+(?:amazon|etsy|ebay)|seller\s+central|marketplace\s+seller\s+account)\b",
    "real_estate": r"\b(?:retail\s+(?:units?|space)\s+(?:to\s+let|for\s+lease)|commercial\s+lease|shop\s+to\s+let)\b",
    "betting": r"\b(?:betting\s+odds|bookmaker|sportsbook)\b",
    "sports_pitch": r"\b(?:3g|4g|astro\s*turf|football|rugby|cricket|hockey|5[\s-]a[\s-]side|floodlights?|changing\s+rooms|"
                    r"kick[\s-]off|grass\s+pitch|pitch\s+hire|sports?\s+pitch|playing\s+fields?|league\s+fixtures|pitch\s+charges|pitch\s+lets|school\s+lets|"
                    r"lettings?\s+(?:policy|charges)|sports\s+hall)\b",
    "traveller_site": r"\b(?:gypsy|traveller\s+(?:site|pitch)|travelling\s+showpeople|caravan\s+site|planning\s+appeal|"
                      r"planning\s+inspectorate|appeal\s+inquiry)\b",
    "fixed_concession": r"\b(?:lay-?by\s+trading|trading\s+pitch\s+opportunity|kiosk\s+(?:lease|licen[cs]e|tender|opportunity)|"
                        r"concession\s+(?:lease|tender)|catering\s+concession\s+opportunity)\b",
    "rates_concession": r"\b(?:pensioner|rates?\s+concession|concession\s+card|seniors?\s+card|health\s+care\s+card)\b",
}
NEGATIVE_RE = {k: re.compile(v, re.I) for k, v in NEGATIVE_PATTERNS.items()}

CLOSED_PATTERNS = [
    r"\bapplications?\s+(?:are\s+|is\s+)?(?:now\s+|currently\s+)?closed\b",
    r"\b(?:vendor|trader|stallholder|exhibitor)?\s*(?:spaces|applications?|registration)\s+(?:are|is)\s+currently\s+(?:closed|full)\b",
    r"\b(?:applications?|registration|bookings?)\s+(?:have|has)\s+(?:now\s+)?closed\b",
    r"\bdeadline\s+has\s+passed\b",
    r"\bno\s+longer\s+(?:accepting|taking)\s+(?:applications|vendors|traders|stallholders|bookings)\b",
    r"\b(?:vendor|trader|stall|exhibitor|pitch)\s+(?:spaces?\s+)?(?:are\s+)?(?:fully\s+booked|sold\s+out)\b",
    r"\bwe\s+are\s+(?:now\s+)?(?:fully\s+booked|full)\b",
    r"\bapplication\s+(?:period|window)\s+(?:is\s+|has\s+)?(?:now\s+)?(?:closed|ended)\b",
    r"\b(?:applications?|registrations?|bookings?)\s+(?:are\s+|is\s+)?no\s+longer\s+(?:being\s+)?(?:accepted|taken|available)\b",
    r"\b(?:is|are)\s+(?:currently\s+)?not\s+(?:currently\s+)?accepting\s+(?:any\s+)?(?:new\s+)?(?:applications|vendors|traders|stallholders|exhibitors)\b",
    r"\bno\s+longer\s+accepting\s+responses\b",
    r"\bbookings?\s+(?:are\s+|is\s+)?(?:now\s+)?closed\b",
    r"\b(?:we\s+are\s+)?not\s+(?:currently\s+)?(?:taking|accepting)\s+(?:any\s+)?(?:new\s+)?(?:stallholders|traders|vendors|bookings|applications)\b",
    r"\bexpressions?\s+of\s+interest\s+(?:have|has|are|is)\s+(?:now\s+)?closed\b",
    r"\b(?:vendor\s+|trader\s+|stallholder\s+|exhibitor\s+)?applications?\b[^.\n]{0,40}?\b(?:have|has|are|is)\s+(?:now\s+)?closed\b",
    r"\bthis\s+form\s+is\s+(?:now\s+)?closed\b",
    r"\ball\s+available\s+(?:price\s+options|spaces|booths|spots|stalls|pitches)\s+(?:are|have)\s+(?:been\s+)?sold\s+out\b",
    r"\b(?:vendor|trader|stallholder|exhibitor)\s+(?:applications?|registration)\s+(?:for\s+20\d\d\s+)?(?:is|are|has|have)\s+(?:now\s+)?(?:closed|full)\b",
]
NOT_YET_OPEN_PATTERNS = [
    r"\bapplications?\s+(?:for\s+20\d\d\s+)?will\s+(?:re)?open\b",
    r"\b(?:form|applications?|registrations?)\s+(?:will\s+)?(?:re)?opens?\s+(?:on\s+|in\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|\d)",
    r"\bcheck\s+back\s+(?:in|soon|later)\b",
    r"\bapplications?\b[^.\n]{0,40}?\bwill\s+(?:re)?open\b",
    r"\bfirst\s+to\s+know\b[^.\n]{0,80}\bapplications?\b",
    r"\b(?:applications?|bookings?|registrations?|expressions?\s+of\s+interest)\s+(?:will\s+)?(?:open|opening|re-?open)s?\s+(?:on|from|in)\s+(?:early\s+|late\s+|mid[\s-])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)",
    r"\bregister\s+your\s+interest\b",
    r"\b(?:applications?|application\s+forms?|booking\s+forms?|vendor\s+forms?)\b[^.\n]{0,30}\bwill\s+become\s+available\b",
    r"\b(?:know|notified|notify\s+you|hear)\s+when\s+(?:vendor\s+|trader\s+)?applications?\s+(?:open|are\s+open|go\s+live|launch)",
    r"\b(?:applications?|bookings?|registrations?|stall\s+bookings?|vendor\s+applications?)\s+(?:are\s+|for\s+20\d\d\s+)?coming\s+soon\b",
]
NOT_YET_OPEN_RE = [re.compile(p, re.I) for p in NOT_YET_OPEN_PATTERNS]
CLOSED_RE = [re.compile(p, re.I) for p in CLOSED_PATTERNS]

OPEN_PATTERNS = [
    r"\bapplications?\s+(?:are\s+|is\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|until|each|every|again|later|soon)\b)",
    r"\b(?:now\s+)?accepting\s+(?:applications|vendors|traders|stallholders|exhibitors|bookings)\b",
    r"\bapply\s+now\b", r"\bbook\s+(?:your|a)\s+(?:stall|pitch|space|booth)\s+(?:now|today)\b",
    r"\bregistration\s+(?:is\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|until|each|every|again|later|soon)\b)",
    r"\b(?:stallholder|vendor|trader|exhibitor)\s+applications?\s+(?:are\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|until|each|every|again|later|soon)\b)",
    r"\bapplications?\s+(?:are\s+)?(?:now\s+)?being\s+accepted\b",
    r"\b(?:now\s+)?taking\s+(?:stall\s+|pitch\s+|trade\s+stand\s+)?bookings\b",
    r"\bbookings?\s+(?:are\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|until|each|every|again|later|soon)\b)",
    r"\bexpressions?\s+of\s+interest\s+(?:are\s+)?(?:now\s+)?open\b(?!\s+(?:in|on|from|until|each|every|again|later|soon)\b)",
    r"\bstallholders\s+wanted\b",
]
OPEN_RE = [re.compile(p, re.I) for p in OPEN_PATTERNS]

RECURRENCE_PATTERNS = [
    r"\bevery\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|week|month)\b",
    r"\bevery\s+(?:first|second|third|fourth|last|1st|2nd|3rd|4th)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
    r"\b(?:weekly|fortnightly|monthly)\s+(?:market|fair|event)\b",
    r"\bopen\s+(?:every|each)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b",
    r"\b(?:saturdays|sundays)\s*,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b",
    r"\bheld\s+(?:every|each|on\s+the\s+(?:first|second|third|fourth|last))\b",
]
RECURRENCE_RE = [re.compile(p, re.I) for p in RECURRENCE_PATTERNS]

DEADLINE_CUE = re.compile(
    r"(?:deadline|closing\s+date|applications?\s+(?:close|closes|due|must\s+be\s+(?:received|submitted))|"
    r"apply\s+by|submit(?:ted)?\s+by|due\s+by|no\s+later\s+than|last\s+date\s+for\s+applications|"
    r"applications?\s+(?:will\s+)?close|cut[\s-]?off|(?:submitted|returned|received|sent|emailed)\s+(?:to\s+\S+\s+)?by)",
    re.I,
)

# Link anchors / URL paths that tend to lead to the trader page of an organiser site.
LINK_STRONG = re.compile(
    r"(?:vendor|stall[\s_-]?holder|trader|exhibitor|concession|trade[\s_-]?stand|tradestand|traders|"
    r"stalls?|pitch|booth|artisan|food[\s_-]?truck|street[\s_-]?food|apply[\s_-]?to[\s_-]?trade|"
    r"sell[\s_-]?with[\s_-]?us|trade[\s_-]?with[\s_-]?us|become[\s_-]?a|get[\s_-]?involved|take[\s_-]?part|"
    r"participat|book[\s_-]?a[\s_-]?(?:stall|pitch|stand|space)|makers|crafters)",
    re.I,
)
LINK_MEDIUM = re.compile(
    r"(?:apply|application|book(?:ing)?s?\b|register|enquir|opportunit|join[\s_-]?us|involved|"
    r"business|commercial|sponsor|partner|forms?\b|downloads?|info(?:rmation)?\b|faq)",
    re.I,
)
LINK_NEGATIVE = re.compile(
    r"(?:privacy|cookie|terms[\s_-]?of[\s_-]?use|login|log[\s_-]?in|sign[\s_-]?in|cart|basket|checkout|"
    r"tickets?\b|accessibility|press|news/\d|blog/\d|gallery|photos?|careers|jobs|volunteer|wp-admin|"
    r"/tag/|/category/|/author/|\?replytocom|feed\b|\.xml$|lost[\s_-]?property|parking|camping)",
    re.I,
)

NON_VENDOR_ANCHOR = re.compile(
    r"(?:newsletter|updates|mailing\s+list|subscribe|tickets?|volunteer|donat|sponsor|parade|scholarship|youth|"
    r"pageant|contest|competition|entries|livestock|camping|performer|perform|musician|band|artist\s+(?:in|of)|"
    r"jobs?|careers?|staff|employment|press|media\s+accreditation|lost|accessib|refund|film|screening|"
    r"submission|shop\s+now|merch\s+store|busk|suite|rental|audition|talent|payment)", re.I)
# Link targets that are never vendor routes even if the anchor says "sign up"/"apply".
NON_ROUTE_HOSTS = re.compile(r"(?:showingscene\.com|eepurl\.com|list-manage\.com|constantcontact\.com|amazon\.|filmfreeway\.com|"
                             r"paypal\.com|gofundme\.com|justgiving\.com|linktr\.ee)", re.I)
APPLY_ANCHOR = re.compile(
    r"(?:apply|application|book\s+(?:a\s+|your\s+)?(?:stall|pitch|space|stand|booth|site|table|now)|register|registration|"
    r"sign\s*up|enquir|inquir|booking\s+form|download.{0,30}form|form\b|submit|reserve|"
    r"(?:purchase|buy|rent)\s+(?:a\s+|your\s+)?(?:booth|table|space|pitch|stall|spot))",
    re.I,
)
FORM_DOC = re.compile(r"\.(?:pdf|docx?|odt|rtf)(?:\?|$)", re.I)
FORM_DOC_NAME = re.compile(r"(?:application|booking|form\b|apply|registration|contract|prospectus|pack\b|packet|enquiry|inquiry)", re.I)

# Hosts whose presence as a link target is itself evidence of an application route.
APPLICATION_PLATFORMS = {
    "eventeny.com": "Eventeny",
    "zapplication.org": "ZAPP",
    "marketspread.com": "Marketspread",
    "entrythingy.com": "EntryThingy",
    "callforentry.org": "CaFE",
    "festivalnet.com": "FestivalNet",
    "jotform.com": "Jotform",
    "jotform.co": "Jotform",
    "form.jotform.com": "Jotform",
    "docs.google.com/forms": "Google Forms",
    "forms.gle": "Google Forms",
    "typeform.com": "Typeform",
    "cognitoforms.com": "Cognito Forms",
    "wufoo.com": "Wufoo",
    "formstack.com": "Formstack",
    "123formbuilder.com": "123FormBuilder",
    "forms.office.com": "Microsoft Forms",
    "forms.microsoft.com": "Microsoft Forms",
    "airtable.com/shr": "Airtable",
    "airtable.com/app": "Airtable",
    "paperform.co": "Paperform",
    "tally.so": "Tally",
    "fillout.com": "Fillout",
    "smartsheet.com/b/form": "Smartsheet",
    "formsite.com": "Formsite",
    "stallmanager.com.au": "Stall Manager",
    "localstalls.com/au/event": "LocalStalls", "localstalls.com/nz/event": "LocalStalls",
    "localstalls.com/uk/event": "LocalStalls", "localstalls.com/us/event": "LocalStalls",
    "cluemart.co.nz/application": "ClueMart",
    "mymarket.org": "MyMarket",
    "openforms.com": "OpenForms",
    "snapforms.com.au": "Snapforms",
    "tfaforms.com": "FormAssembly",
    "fiona-app.com": "Fiona",
    "xibitor.com.au": "Xibitor",
    "infoodle.com": "Infoodle",
    "festivalpro.com": "FestivalPro",
    "mapyourshow.com": "Map Your Show",
    "goexposoftware.com": "Go Expo",
    "ozeemarkets.com.au": "Ozee Markets",
    "sitetrak.com.au": "Sitetrak",
    "localstalls.com": "LocalStalls",
    "managemymarket.com": "Manage My Market",
    "marketwurks.com": "MarketWurks",
    "eventhub.net": "EventHub",
    "myfestivalapp.com": "My Festival App",
    "artsfestivalsolutions": "Arts Festival Solutions",
    "juriedartservices.com": "Juried Art Services",
    "showgroundsonline.com.au": "Showgrounds Online",
    "showday.online": "Showday Online",
    "stallholder.co": "Stallholder",
    "eventbrite.": "Eventbrite",
    "trybooking.com": "TryBooking",
    "humanitix.com": "Humanitix",
    "ticketsource.co.uk": "TicketSource",
    "wix.com/forms": "Wix Forms",
    "squarespace.com": "Squarespace",
    "formsubmit.co": "FormSubmit",
    "surveymonkey.com": "SurveyMonkey",
    "zohopublic.com": "Zoho Forms",
    "forms.zohopublic": "Zoho Forms",
    "hsforms.com": "HubSpot Forms",
    "share.hsforms.com": "HubSpot Forms",
    "eventsair.com": "EventsAir",
    "a2zinc.net": "a2z (exhibitor portal)",
    "map-dynamics.com": "Map Dynamics (exhibitor portal)",
    "expocad": "ExpoCAD",
}
# Ticketing platforms appear on almost every event site; on their own they are NOT a vendor route.
TICKETING_ONLY = {"Eventbrite", "TryBooking", "Humanitix", "TicketSource", "Squarespace", "Wix Forms"}


def platform_of(url: str) -> str | None:
    u = url.lower()
    for k, v in APPLICATION_PLATFORMS.items():
        if k in u:
            return v
    return None


# Platforms whose pages are themselves forms (any page on them is an application form).
FORM_PROVIDERS = {"OpenForms", "Snapforms", "FormAssembly", "Fiona", "Jotform", "Google Forms", "Typeform", "Cognito Forms", "Wufoo", "Formstack", "123FormBuilder",
                  "Microsoft Forms", "Airtable", "Paperform", "Tally", "Fillout", "Smartsheet", "Formsite",
                  "Zoho Forms", "HubSpot Forms", "SurveyMonkey", "FormSubmit"}
# Application platforms: URL paths that denote an actual application page (vs. profiles/marketing pages).
PLATFORM_APP_PATH = {
    "Eventeny": r"/events/(?:vendor|applications)/",
    "ZAPP": r"(?:event-info|apply|application)",
    "Marketspread": r"/(?:apply|application|vendor-application)",
    "LocalStalls": r"/(?:au|nz|uk|us|en)/event/|/(?:apply|application|book)",
    "ClueMart": r"/application/",
    "MyMarket": r"/forms/",
    "EntryThingy": r"/(?:show|event|apply)",
    "CaFE": r"/(?:call|calls)/",
    "Stall Manager": r"/(?:apply|application|book|stallholder)",
    "Ozee Markets": r"/(?:apply|application|book|register)",
    "Sitetrak": r"/(?:apply|application|book)",
    "Manage My Market": r"/(?:apply|application|vendor)",
    "MarketWurks": r"/(?:apply|application|vendor)",
}
