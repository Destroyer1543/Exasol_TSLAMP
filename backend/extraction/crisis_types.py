from enum import Enum

class CrisisType(str, Enum):
    WAR               = "WAR"
    CONFLICT          = "CONFLICT"
    ECONOMIC          = "ECONOMIC"
    SUPPLY_CHAIN      = "SUPPLY_CHAIN"
    NATURAL_DISASTER  = "NATURAL_DISASTER"
    HEALTH            = "HEALTH"
    POLITICAL         = "POLITICAL"
    FOOD              = "FOOD"
    ENERGY            = "ENERGY"
    CLIMATE           = "CLIMATE"
    HUMANITARIAN      = "HUMANITARIAN"

class Severity(str, Enum):
    CRITICAL   = "CRITICAL"
    HIGH       = "HIGH"
    MEDIUM     = "MEDIUM"
    LOW        = "LOW"
    MONITORING = "MONITORING"

class Sector(str, Enum):
    ENERGY      = "ENERGY"
    FOOD        = "FOOD"
    FINANCE     = "FINANCE"
    TRADE       = "TRADE"
    HEALTH      = "HEALTH"
    TRANSPORT   = "TRANSPORT"
    POLITICS    = "POLITICS"
    HUMANITARIAN = "HUMANITARIAN"
    TECHNOLOGY  = "TECHNOLOGY"

class RelationshipType(str, Enum):
    CAUSES    = "CAUSES"
    WORSENS   = "WORSENS"
    DISRUPTS  = "DISRUPTS"
    TRIGGERS  = "TRIGGERS"
    CORRELATES = "CORRELATES"
    MITIGATES = "MITIGATES"

SEVERITY_WEIGHT = {
    Severity.CRITICAL:   5,
    Severity.HIGH:       4,
    Severity.MEDIUM:     3,
    Severity.LOW:        2,
    Severity.MONITORING: 1,
}
