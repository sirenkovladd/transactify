package src

import (
	"database/sql"
	"strings"
	"time"
)

type Transaction struct {
	Amount     float64   `json:"amount"`
	Currency   string    `json:"currency"`
	OccurredAt time.Time `json:"occurredAt"`
	Merchant   string    `json:"merchant"`
	Card       string    `json:"card"`
	PersonName string    `json:"personName"`
}

var Categories = map[string][]string{
	"mobile internet": {"KOODO AIRTIME", "KOODO MOBILE"},
	"internet":        {"NOVUS"},
	"food & other":    {"SAVE ON FOODS", "URBAN FARE", "NOFRILLS JOTI'S", "BC LIQUOR", "LENA MARKET", "WHOLE FOODS", "JASMINE HALAL MEATS AND M", "EAST WEST MARKET", "PIAST BAKERY", "POLO FARMERS MARKET 2", "ORGANIC ACRES MARKET", "MARKET MEATS KITSILAN", "SEVEN SEAS FISH MARKET ON", "LITTLE GEM GROCERY", "TOP TEN PRODUCE", "BERRYMOBILE", "LEGACY LIQUOR STORE", "VALHALLA PURE OUTFITTERS", "OSYOOS PRODUCE", "SQ *OH SWEET DAY BAKE SH", "Body Energy Club", "Aburi Market"},
	"takeouts":        {"BIG DADDY'S FISH FRY", "STARBUCKS", "LA DIPERIE", "MR. SUSHI MAIN STREET", "FOGLIFTER COFFEE ROASTERS", "STEGA EATERY", "THE WATSON", "BEST FALAFEL", "DOORDASHFATBURGER", "OPHELIA", "CANUCKS SPORTS", "Matchstick Riley Park", "PNE FOOD & BEVERAGE", "HUNNYBEE", "PUREBREAD BAKERY", "CULTIVATE TEA", "COMMODORE BALLROOM", "SUPERFLUX (CABANA)", "IRISH TIMES PUB", "THE BENT MAST RESTAURANT", "CRUST BAKERY", "TERRAZZO", "10 ACRES", "THE FISH STORE AT FISHER", "Old Country Market", "BARKLEY CAFE", "RHINO COFFEE HOUSE", "SQ *#B33R", "PLEASE BEVERAGE", "Small Victory Bakery", "VIA TEVERE MAIN ST", "BEAUCOUP BAKERY AND C", "Sq *Thierry Mt. Pleasant", "Holy Eucharist Cathed", "KOZAK"},
	"transportation":  {"LYFT", "COMPASS WEB", "UBER", "COMPASS WALK", "COMPASS ACCOUNT", "BC TRANSIT", "COMPASS AUTOLOAD", "BCF - ONLINE SALES", "BC, SPIRIT OF", "BCF-CUSTOMER SERVICE CENT"},
	"clothes":         {"Bailey Nelson", "THE ROCKIN COWBOY", "WINNERSHOMESENSE", "SP KOTN", "TOFINO PHARMACY", "Lamaisonsimons"},
	"health":          {"COASTAL EYE CLINIC"},
	"home goods":      {"CANADIAN TIRE", "AMAZON*", "AMAZON.COM *", "YOUR DOLLAR STORE", "VALUE VILLAGE", "MICHAELS", "Amazon.ca", "DOLLARAMA", "SALARMY", "BLUMEN FLORALS", "HCM*CARSON BOOKS INC", "Hetzner Online Gmbh", "Smart N Save", "The Best Shop", "Popeyes"},
	"presents":        {"PET VALU CANADA INC.", "APPLE.COM/CA", "SP DBCANADA"},
	"haircut":         {"KONAS BARBER SHOP"},
	"donations":       {},
	"therapy":         {},
	"english":         {},
	"french":          {"Preply"},
	"events":          {"TICKETLEADER", "SEATGEEK TICKETS", "ROYAL BC MUSEUM", "FOX CABARET", "BOUNCE* TICKET", "Cineplex", "Eventbrite"},
	"travel":          {"VIA RAIL/ZAW99N", "AIR CAN*", "BOOKING.COM", "Wb E-Store"},
	"london drugs":    {"LONDON DRUGS", "SHOPPERS DRUG"},
	"taxAccountant":   {"LILICO"},
	"film":            {"Amazon Channels", "PrimeVideo"},
	"hotel":           {"Hotel at"},
	"visa":            {"Ups"},
}

func GetCategory(merchant string) string {
	for category, patterns := range Categories {
		for _, pattern := range patterns {
			if strings.Contains(strings.ToLower(merchant), strings.ToLower(pattern)) {
				return category
			}
		}
	}
	return "Unknown"
}

func GetStatement(db *sql.DB) (*sql.Stmt, error) {
	stmt, err := db.Prepare("INSERT INTO transactions(amount, currency, occurred_at, merchant, card, category, person_name) VALUES($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (merchant, occurred_at) DO UPDATE SET amount = $1, currency = $2, card = $5, category = $6, person_name = $7")
	if err != nil {
		return nil, err
	}
	return stmt, nil
}

func InsertTransaction(stmt *sql.Stmt, t Transaction) error {
	_, err := stmt.Exec(t.Amount, t.Currency, t.OccurredAt, t.Merchant, t.Card, GetCategory(t.Merchant), t.PersonName)
	if err != nil {
		return err
	}
	return nil
}
