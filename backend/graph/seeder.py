"""
Seeds the knowledge graph with real current global crises (as of 2025).
This gives NEXUS an immediate rich graph to demonstrate.
"""

from .knowledge_graph import CrisisKnowledgeGraph, CrisisNode, CrisisEdge
from ..extraction.crisis_types import CrisisType, Severity, RelationshipType


def seed(graph: CrisisKnowledgeGraph):
    """Populate graph with real current crises and their relationships."""
    _add_nodes(graph)
    _add_edges(graph)


# ── CRISIS NODES ───────────────────────────────────────────────────────────────

def _add_nodes(g: CrisisKnowledgeGraph):
    nodes = [
        CrisisNode(
            id="russia_ukraine_war",
            title="Russia-Ukraine War",
            type=CrisisType.WAR, severity=Severity.CRITICAL,
            lat=49.0, lon=31.0, country="Ukraine",
            description="Full-scale Russian invasion since Feb 2022. Largest land war in Europe since WWII. Causing global energy, food, and economic shockwaves far beyond the battlefield.",
            sectors_affected=["ENERGY","FOOD","TRADE","FINANCE"],
            start_date="2022-02-24",
            tags=["russia","ukraine","nato","war","europe"],
        ),
        CrisisNode(
            id="gaza_conflict",
            title="Gaza-Israel-Iran Conflict",
            type=CrisisType.CONFLICT, severity=Severity.CRITICAL,
            lat=31.4, lon=34.4, country="Middle East",
            description="Conflict that began Oct 2023 has escalated into a broader Middle East war by 2026. 60,000+ casualties in Gaza. Israeli strikes on Iran escalated to direct Iran-Israel confrontation. Regional powers drawn in. Gulf oil infrastructure under threat. Global energy markets in crisis mode.",
            sectors_affected=["HUMANITARIAN","HEALTH","TRADE","POLITICS","ENERGY"],
            start_date="2023-10-07",
            tags=["israel","palestine","hamas","iran","middle_east","humanitarian","war"],
        ),
        CrisisNode(
            id="houthi_red_sea",
            title="Houthi Red Sea Attacks",
            type=CrisisType.CONFLICT, severity=Severity.HIGH,
            lat=14.5, lon=42.5, country="Yemen / Red Sea",
            description="Houthi militants attacking commercial vessels in Red Sea since Nov 2023, claiming solidarity with Gaza. Over 100 ships targeted. Major shipping lanes disrupted.",
            sectors_affected=["TRADE","ENERGY","TRANSPORT"],
            start_date="2023-11-19",
            tags=["houthi","yemen","red_sea","shipping","iran"],
        ),
        CrisisNode(
            id="red_sea_shipping_disruption",
            title="Red Sea Shipping Disruption",
            type=CrisisType.SUPPLY_CHAIN, severity=Severity.HIGH,
            lat=18.0, lon=40.0, country="International Waters",
            description="90% of ships diverted from Suez Canal around Cape of Good Hope, adding 10–14 days and $1M+ per voyage. Global supply chains severely strained.",
            sectors_affected=["TRADE","ENERGY","FOOD","TRANSPORT"],
            start_date="2023-12-01",
            tags=["suez","shipping","supply_chain","trade"],
        ),
        CrisisNode(
            id="global_shipping_costs",
            title="Global Shipping Cost Surge",
            type=CrisisType.ECONOMIC, severity=Severity.HIGH,
            lat=1.3, lon=103.8, country="Global",
            description="Container shipping rates holding at 4–5× pre-crisis levels through 2025–2026. Red Sea diversion driving persistent freight premium. All import-dependent economies absorbing higher input costs; no normalization in sight while Middle East conflict continues.",
            sectors_affected=["TRADE","FINANCE","FOOD","ENERGY"],
            start_date="2024-01-01",
            tags=["containers","freight","inflation","trade"],
        ),
        CrisisNode(
            id="india_lpg_prices",
            title="India Petroleum & LPG Shortage",
            type=CrisisType.ECONOMIC, severity=Severity.HIGH,
            lat=20.6, lon=79.0, country="India",
            description="Acute petroleum and LPG shortage hitting India in 2026 — cylinder prices up 35–40%, supply gaps in multiple states. Directly attributed to Middle East war disrupting Gulf oil exports and Red Sea shipping routes. India imports 85%+ of crude; Gulf suppliers redirecting supply under sanctions pressure.",
            sectors_affected=["ENERGY","HUMANITARIAN","FINANCE","TRANSPORT"],
            start_date="2025-09-01",
            tags=["india","lpg","petroleum","fuel_shortage","energy_prices","gulf"],
        ),
        CrisisNode(
            id="global_energy_volatility",
            title="Global Energy Price Volatility",
            type=CrisisType.ENERGY, severity=Severity.CRITICAL,
            lat=26.0, lon=50.5, country="Global",
            description="Crude oil surging past $105/bbl in early 2026 amid Gulf war escalation fears. Iran export disruptions removing 1.2M bpd from markets. OPEC+ unable to compensate. Natural gas at 3× pre-war levels. Energy security now top geopolitical priority; import-dependent nations facing severe supply stress.",
            sectors_affected=["ENERGY","FINANCE","TRADE","FOOD"],
            start_date="2022-03-01",
            tags=["oil","gas","opec","iran","energy_security","gulf"],
        ),
        CrisisNode(
            id="europe_energy_crisis",
            title="European Energy Crisis",
            type=CrisisType.ENERGY, severity=Severity.HIGH,
            lat=51.0, lon=10.0, country="European Union",
            description="EU cut Russian gas from 40% to <10% of supply. Energy poverty doubled. Industrial output reduced in Germany, Italy. Accelerating renewables transition under duress.",
            sectors_affected=["ENERGY","FINANCE","POLITICS"],
            start_date="2022-06-01",
            tags=["europe","gas","nordstream","energy_transition"],
        ),
        CrisisNode(
            id="black_sea_grain",
            title="Black Sea Grain Export Disruption",
            type=CrisisType.SUPPLY_CHAIN, severity=Severity.HIGH,
            lat=43.0, lon=34.0, country="Ukraine / Russia",
            description="Ukraine supplies 12% of global wheat, 15% of corn, 50% of sunflower oil. War-driven export disruption; grain deal collapsed Jul 2023. 400M people depend on Ukrainian grain.",
            sectors_affected=["FOOD","TRADE","FINANCE"],
            start_date="2022-03-01",
            tags=["grain","wheat","ukraine","food_security"],
        ),
        CrisisNode(
            id="global_food_prices",
            title="Global Food Price Crisis",
            type=CrisisType.FOOD, severity=Severity.HIGH,
            lat=0.0, lon=20.0, country="Global",
            description="FAO Food Price Index 20–30% above pre-war levels. 282 million people acutely food insecure. Low-income import-dependent nations hardest hit.",
            sectors_affected=["FOOD","HUMANITARIAN","FINANCE","POLITICS"],
            start_date="2022-04-01",
            tags=["fao","food_security","hunger","inflation"],
        ),
        CrisisNode(
            id="el_nino_2023",
            title="El Niño 2023–24",
            type=CrisisType.CLIMATE, severity=Severity.HIGH,
            lat=-0.5, lon=-150.0, country="Pacific Ocean / Global",
            description="Strongest El Niño in 7 years. Causing drought in East Africa, flooding in South America, heat extremes in Asia. Disrupting agriculture across 3 continents.",
            sectors_affected=["FOOD","ENERGY","TRANSPORT"],
            start_date="2023-06-01",
            tags=["el_nino","climate","drought","floods"],
        ),
        CrisisNode(
            id="east_africa_drought",
            title="East Africa Drought",
            type=CrisisType.NATURAL_DISASTER, severity=Severity.HIGH,
            lat=4.0, lon=37.0, country="Ethiopia / Kenya / Somalia",
            description="5 consecutive failed rainy seasons (2020–2023). Worst drought in 40 years across Horn of Africa. Livestock losses 70%+. 23 million facing acute food insecurity.",
            sectors_affected=["FOOD","HUMANITARIAN","HEALTH"],
            start_date="2020-01-01",
            tags=["drought","horn_of_africa","ethiopia","kenya","somalia"],
        ),
        CrisisNode(
            id="east_africa_food_crisis",
            title="East Africa Food Crisis",
            type=CrisisType.FOOD, severity=Severity.CRITICAL,
            lat=7.0, lon=39.0, country="Ethiopia / Somalia / Sudan",
            description="23+ million people facing IPC Phase 3–4 food insecurity. Famine conditions in parts of Somalia. Aid pipelines disrupted by conflict and logistics failures.",
            sectors_affected=["HUMANITARIAN","HEALTH","POLITICS"],
            start_date="2022-01-01",
            tags=["famine","africa","wfp","hunger","aid"],
        ),
        CrisisNode(
            id="sudan_civil_war",
            title="Sudan Civil War",
            type=CrisisType.WAR, severity=Severity.CRITICAL,
            lat=15.5, lon=32.5, country="Sudan",
            description="SAF vs RSF conflict since Apr 2023. 9 million displaced — world's largest displacement crisis. Khartoum largely destroyed. Famine spreading. Aid access near zero.",
            sectors_affected=["HUMANITARIAN","FOOD","HEALTH","POLITICS"],
            start_date="2023-04-15",
            tags=["sudan","rsf","saf","displacement","famine"],
        ),
        CrisisNode(
            id="pakistan_economic_crisis",
            title="Pakistan Economic Crisis",
            type=CrisisType.ECONOMIC, severity=Severity.HIGH,
            lat=30.3, lon=69.3, country="Pakistan",
            description="Foreign reserves near depletion in 2023. IMF bailout secured. Inflation peaked 38%. Rupee lost 50% value. 40% of population below poverty line.",
            sectors_affected=["FINANCE","FOOD","ENERGY","POLITICS"],
            start_date="2022-08-01",
            tags=["pakistan","imf","inflation","debt"],
        ),
        CrisisNode(
            id="lebanon_collapse",
            title="Lebanon Economic Collapse",
            type=CrisisType.ECONOMIC, severity=Severity.CRITICAL,
            lat=33.9, lon=35.5, country="Lebanon",
            description="World Bank ranks as one of worst economic collapses since 1850. Currency lost 95% of value. Banking sector frozen. 80% of population in poverty. State near-failed.",
            sectors_affected=["FINANCE","FOOD","HEALTH","POLITICS"],
            start_date="2019-10-01",
            tags=["lebanon","banking","currency","poverty"],
        ),
        CrisisNode(
            id="egypt_economic_stress",
            title="Egypt Economic Stress",
            type=CrisisType.ECONOMIC, severity=Severity.HIGH,
            lat=26.8, lon=30.8, country="Egypt",
            description="Suez Canal revenues down 40–50% due to Red Sea rerouting. Wheat import costs surged — Egypt is world's largest wheat importer. IMF package of $8B secured.",
            sectors_affected=["FINANCE","FOOD","TRADE","POLITICS"],
            start_date="2022-03-01",
            tags=["egypt","wheat","suez","imf","inflation"],
        ),
        CrisisNode(
            id="taiwan_strait_tensions",
            title="Taiwan Strait Tensions",
            type=CrisisType.POLITICAL, severity=Severity.MEDIUM,
            lat=24.0, lon=119.5, country="Taiwan / China",
            description="PLA military exercises intensifying. Taiwan produces 90% of world's advanced semiconductors (TSMC). Any disruption would trigger global tech supply shock.",
            sectors_affected=["TECHNOLOGY","TRADE","FINANCE","POLITICS"],
            start_date="2022-08-01",
            tags=["taiwan","china","tsmc","semiconductors","us_china"],
        ),
        CrisisNode(
            id="semiconductor_supply_risk",
            title="Semiconductor Supply Risk",
            type=CrisisType.SUPPLY_CHAIN, severity=Severity.MEDIUM,
            lat=25.0, lon=121.5, country="Taiwan / Global",
            description="TSMC fab concentration in Taiwan poses systemic risk to global electronics, auto, AI, and defence sectors. US CHIPS Act and EU Chips Act attempting to diversify.",
            sectors_affected=["TECHNOLOGY","TRADE","FINANCE"],
            start_date="2022-01-01",
            tags=["chips","tsmc","supply_chain","technology"],
        ),
        CrisisNode(
            id="myanmar_civil_war",
            title="Myanmar Civil War",
            type=CrisisType.CONFLICT, severity=Severity.HIGH,
            lat=19.7, lon=96.1, country="Myanmar",
            description="Junta vs resistance forces since 2021 coup. 3 million displaced. 18 million facing food insecurity. Drug trade funding conflict actors. Regional instability spreading.",
            sectors_affected=["HUMANITARIAN","FOOD","POLITICS","TRADE"],
            start_date="2021-02-01",
            tags=["myanmar","junta","coup","asean","displacement"],
        ),
        CrisisNode(
            id="sahel_instability",
            title="Sahel Political Instability",
            type=CrisisType.POLITICAL, severity=Severity.HIGH,
            lat=14.0, lon=2.0, country="Mali / Niger / Burkina Faso",
            description="7 coups in 3 years across Sahel. French forces expelled. Russian Wagner/Africa Corps filling vacuum. Jihadist insurgency expanding. Aid organizations expelled.",
            sectors_affected=["POLITICS","HUMANITARIAN","FOOD","ENERGY"],
            start_date="2021-01-01",
            tags=["sahel","mali","niger","burkina","wagner","jihadism"],
        ),
        CrisisNode(
            id="haiti_crisis",
            title="Haiti Humanitarian Crisis",
            type=CrisisType.HUMANITARIAN, severity=Severity.CRITICAL,
            lat=18.9, lon=-72.3, country="Haiti",
            description="Gang control of 80% of Port-au-Prince. State effectively collapsed. 5 million facing acute food insecurity. UN multinational security mission barely functioning.",
            sectors_affected=["HUMANITARIAN","HEALTH","FOOD","POLITICS"],
            start_date="2021-07-07",
            tags=["haiti","gangs","un","collapse","food"],
        ),
        CrisisNode(
            id="global_inflation",
            title="Global Inflation Wave",
            type=CrisisType.ECONOMIC, severity=Severity.HIGH,
            lat=40.7, lon=-74.0, country="Global",
            description="Post-pandemic inflation briefly eased in 2024 but re-accelerated in 2025–2026 due to new energy shock from Middle East escalation. Interest rates remain elevated. Debt service crises spreading in Global South; 40+ countries in IMF programs.",
            sectors_affected=["FINANCE","FOOD","ENERGY","TRADE"],
            start_date="2021-01-01",
            tags=["inflation","interest_rates","fed","ecb","debt"],
        ),
        CrisisNode(
            id="iran_regional_proxy",
            title="Iran Regional Proxy Network",
            type=CrisisType.POLITICAL, severity=Severity.HIGH,
            lat=35.7, lon=51.4, country="Iran / Middle East",
            description="Iran's 'Axis of Resistance' — Houthis, Hezbollah, Hamas, Iraqi militias — increasingly coordinated. Regional escalation risk elevated. Oil markets sensitive to any Iran-US incident.",
            sectors_affected=["ENERGY","POLITICS","TRADE"],
            start_date="2023-10-01",
            tags=["iran","hezbollah","hamas","houthi","middle_east"],
        ),
        # ── CHOKEPOINTS ─────────────────────────────────────────────────────────
        CrisisNode(
            id="strait_of_hormuz",
            title="Strait of Hormuz",
            type=CrisisType.SUPPLY_CHAIN, severity=Severity.CRITICAL,
            lat=26.6, lon=56.3, country="Persian Gulf",
            description="21% of global oil and 18% of global LNG passes through this 33km-wide strait. Iran has repeatedly threatened closure. Any disruption would immediately remove ~20M bpd from markets — an irreplaceable chokepoint with no viable bypass.",
            sectors_affected=["ENERGY","TRADE","FINANCE"],
            start_date="2023-10-01",
            tags=["chokepoint","hormuz","oil","iran","gulf","strategic"],
        ),
        CrisisNode(
            id="panama_canal_crisis",
            title="Panama Canal Low Water Crisis",
            type=CrisisType.SUPPLY_CHAIN, severity=Severity.MEDIUM,
            lat=9.0, lon=-79.5, country="Panama",
            description="Record low water levels in 2023–24 due to El Niño drought forced canal to cut daily transits from 36 to 18 ships. Adds 3–4 weeks to Asia–US East Coast routes. 5% of global trade normally transits here — now severely constrained.",
            sectors_affected=["TRADE","ENERGY","FOOD","TRANSPORT"],
            start_date="2023-08-01",
            tags=["chokepoint","panama","canal","drought","shipping","el_nino","strategic"],
        ),
    ]
    for node in nodes:
        g.add_crisis(node)


# ── RELATIONSHIPS ──────────────────────────────────────────────────────────────

def _add_edges(g: CrisisKnowledgeGraph):
    edges = [
        # ── Middle East → Shipping → India LPG (the demo chain) ─────────────
        CrisisEdge("e01", "houthi_red_sea",            "red_sea_shipping_disruption", RelationshipType.CAUSES,   0.95, "Houthi attacks forced 90% of shipping to divert around Africa", 14),
        CrisisEdge("e02", "red_sea_shipping_disruption","global_shipping_costs",       RelationshipType.CAUSES,   0.90, "Longer routes = higher fuel, insurance, and time costs per voyage", 30),
        CrisisEdge("e03", "red_sea_shipping_disruption","india_lpg_prices",            RelationshipType.CAUSES,   0.85, "India imports LPG via Gulf/Red Sea routes; freight premium passed to consumers", 45),
        CrisisEdge("e04", "global_energy_volatility",  "india_lpg_prices",            RelationshipType.CAUSES,   0.80, "LPG is petroleum-derived; crude oil price spikes directly raise LPG costs", 20),
        CrisisEdge("e05", "global_shipping_costs",     "global_inflation",            RelationshipType.WORSENS,  0.75, "Higher shipping costs raise consumer prices for all traded goods", 60),

        # ── Gaza → Regional escalation ────────────────────────────────────────
        CrisisEdge("e06", "gaza_conflict",             "houthi_red_sea",              RelationshipType.TRIGGERS, 0.85, "Houthis declared Red Sea campaign in solidarity with Gaza", 45),
        CrisisEdge("e07", "gaza_conflict",             "iran_regional_proxy",         RelationshipType.WORSENS,  0.80, "Gaza conflict activated Iran's entire proxy network simultaneously", 7),
        CrisisEdge("e08", "iran_regional_proxy",       "houthi_red_sea",              RelationshipType.WORSENS,  0.80, "Iran provides weapons, intelligence, targeting data to Houthis", 0),
        CrisisEdge("e09", "gaza_conflict",             "egypt_economic_stress",       RelationshipType.WORSENS,  0.85, "Suez Canal revenue collapsed 50% as ships avoid Red Sea; tourism also hit", 60),
        CrisisEdge("e10", "gaza_conflict",             "lebanon_collapse",            RelationshipType.WORSENS,  0.70, "Hezbollah involvement, refugee pressure, and border conflict worsening Lebanon", 30),

        # ── Russia-Ukraine → Food chain ───────────────────────────────────────
        CrisisEdge("e11", "russia_ukraine_war",        "black_sea_grain",             RelationshipType.DISRUPTS, 0.95, "Russian blockade and attacks on Ukrainian ports cut grain exports by 50%+", 30),
        CrisisEdge("e12", "black_sea_grain",           "global_food_prices",          RelationshipType.CAUSES,   0.90, "Ukraine + Russia = 28% of global wheat exports; supply shock drove FAO index to record", 45),
        CrisisEdge("e13", "global_food_prices",        "east_africa_food_crisis",     RelationshipType.WORSENS,  0.85, "Food import costs tripled for aid agencies; WFP ration cuts of 50% in Horn of Africa", 60),
        CrisisEdge("e14", "global_food_prices",        "egypt_economic_stress",       RelationshipType.WORSENS,  0.80, "Egypt spends $5B+ annually on wheat imports; price surge devastating for subsidies", 45),
        CrisisEdge("e15", "global_food_prices",        "pakistan_economic_crisis",    RelationshipType.WORSENS,  0.75, "Pakistan imports 20% of wheat needs; food inflation reached 50%+ in 2023", 60),
        CrisisEdge("e16", "global_food_prices",        "lebanon_collapse",            RelationshipType.WORSENS,  0.80, "Lebanon imports 80% of food; food price hyperinflation on top of banking collapse", 30),
        CrisisEdge("e17", "global_food_prices",        "haiti_crisis",               RelationshipType.WORSENS,  0.75, "Haiti imports 50% of food; price surge pushed millions into acute food insecurity", 45),

        # ── Russia-Ukraine → Energy chain ─────────────────────────────────────
        CrisisEdge("e18", "russia_ukraine_war",        "global_energy_volatility",   RelationshipType.CAUSES,   0.95, "Russia = 12% of global oil, 17% of gas; sanctions and pipeline closures shocked markets", 14),
        CrisisEdge("e19", "russia_ukraine_war",        "europe_energy_crisis",        RelationshipType.CAUSES,   0.95, "EU had 40% gas dependency on Russia; rapid cut forced emergency measures", 30),
        CrisisEdge("e20", "global_energy_volatility",  "global_inflation",            RelationshipType.WORSENS,  0.80, "Energy is input cost for all production; energy shock embedded into general inflation", 30),
        CrisisEdge("e21", "europe_energy_crisis",      "global_inflation",            RelationshipType.WORSENS,  0.70, "European energy-intensive industries cut output, reducing global supply", 45),

        # ── Climate chain ─────────────────────────────────────────────────────
        CrisisEdge("e22", "el_nino_2023",             "east_africa_drought",          RelationshipType.CAUSES,   0.90, "El Niño suppressed Indian Ocean rainfall — 5th consecutive failed rainy season", 90),
        CrisisEdge("e23", "east_africa_drought",       "east_africa_food_crisis",     RelationshipType.CAUSES,   0.92, "Crop failures + livestock losses = millions dependent entirely on aid", 60),
        CrisisEdge("e24", "sudan_civil_war",           "east_africa_food_crisis",     RelationshipType.WORSENS,  0.80, "Sudan conflict disrupted regional aid corridors and added 2M+ displaced to regional system", 30),

        # ── Economic contagion ────────────────────────────────────────────────
        CrisisEdge("e25", "global_inflation",          "pakistan_economic_crisis",    RelationshipType.WORSENS,  0.80, "Imported inflation on top of domestic mismanagement triggered FX and debt crisis", 45),
        CrisisEdge("e26", "global_inflation",          "lebanon_collapse",            RelationshipType.WORSENS,  0.70, "Global inflation accelerated Lebanon's existing hyperinflationary spiral", 30),
        CrisisEdge("e27", "global_shipping_costs",     "india_lpg_prices",            RelationshipType.WORSENS,  0.70, "Indian LPG importers absorbing additional $200–400/MT freight premium", 30),

        # ── Tech supply chain ─────────────────────────────────────────────────
        CrisisEdge("e28", "taiwan_strait_tensions",   "semiconductor_supply_risk",    RelationshipType.TRIGGERS, 0.75, "TSMC fabs concentrated in range of PLA missiles; any conflict = instant global chip shortage", 0),

        # ── Sahel ─────────────────────────────────────────────────────────────
        CrisisEdge("e29", "east_africa_food_crisis",  "sahel_instability",            RelationshipType.WORSENS,  0.65, "Food insecurity drives recruitment into armed groups; migratory pressure on Sahel states", 90),
        CrisisEdge("e30", "global_food_prices",       "sahel_instability",            RelationshipType.WORSENS,  0.70, "Urban food riots and rural grievances exploit weak governance in Sahel states", 60),

        # ── Chokepoint: Strait of Hormuz ───────────────────────────────────
        CrisisEdge("e31", "iran_regional_proxy",      "strait_of_hormuz",             RelationshipType.DISRUPTS, 0.88, "Iran controls both shores; proxy network gives Iran ability to mine, block, or harass tanker traffic", 3),
        CrisisEdge("e32", "strait_of_hormuz",         "global_energy_volatility",     RelationshipType.WORSENS,  0.92, "Any closure or even credible threat removes 21% of seaborne oil — Brent spikes $20–40/bbl immediately", 7),
        CrisisEdge("e33", "strait_of_hormuz",         "india_lpg_prices",             RelationshipType.WORSENS,  0.85, "India imports 85% of crude via Gulf/Hormuz route; strait pressure directly raises import parity prices", 14),

        # ── Chokepoint: Panama Canal ───────────────────────────────────────
        CrisisEdge("e34", "el_nino_2023",             "panama_canal_crisis",          RelationshipType.CAUSES,   0.88, "El Niño suppressed Panama rainfall by 40% — Gatun Lake fell to record lows, cutting vessel drafts by 40%", 60),
        CrisisEdge("e35", "panama_canal_crisis",      "global_shipping_costs",        RelationshipType.WORSENS,  0.72, "Canal transit cuts forced Asia–East Coast rerouting via Suez or Cape Horn, adding cost on already-stressed routes", 30),
    ]
    for edge in edges:
        g.add_relationship(edge)
