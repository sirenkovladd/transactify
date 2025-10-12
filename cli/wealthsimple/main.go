package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"code.sirenko.ca/transaction/src"
	"golang.org/x/sync/errgroup"

	_ "github.com/lib/pq"
)

type Raw struct {
	Node struct {
		Amount     string `json:"amount"`
		Currency   string `json:"currency"`
		OccurredAt string `json:"occurredAt"`
		Merchant   string `json:"spendMerchant"`
		Sign       string `json:"amountSign"`
	} `json:"node"`
}

func parseFile(filename string) ([]src.Transaction, error) {
	content, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	// Now let's unmarshall the data into `payload`
	var payload []Raw
	err = json.Unmarshal(content, &payload)
	if err != nil {
		return nil, err
	}

	newTransactions := make([]src.Transaction, len(payload))
	i := 0
	k := 0
	for i < len(payload) {
		node := payload[i].Node
		if node.Sign == "negative" {
			date, err := time.Parse("2006-01-02T15:04:05.999999-07:00", node.OccurredAt)
			if err != nil {
				return nil, err
			}
			amount, err := strconv.ParseFloat(node.Amount, 64)
			if err != nil {
				return nil, err
			}
			newTransactions[k] = src.Transaction{
				Amount:     amount,
				Currency:   node.Currency,
				OccurredAt: date,
				Merchant:   node.Merchant,
				Card:       "wealthsimple",
				PersonName: "Vlad",
			}
			k += 1
		}
		i += 1
	}
	return newTransactions[:k], nil
}

func printTransaction(t src.Transaction) {
	fmt.Println(t.Amount, t.Currency, t.OccurredAt.Format("2006-01-02 15:04:05"), t.Merchant)
}

func loadTransactions(stmt *sql.Stmt, transactions <-chan src.Transaction, cancel func(cause error)) error {
	for t := range transactions {
		printTransaction(t)
		err := src.InsertTransaction(stmt, t)
		fmt.Println("transaction finished", err)
		if err != nil {
			log.Println(err)
			cancel(err)
			return err
		}
	}
	fmt.Println("loadTransactions done")
	cancel(nil)
	return nil
}

func load(listTransactions chan<- src.Transaction, ctx context.Context, filename string) func() error {
	return func() error {
		ts, err := parseFile(filename)
		if err != nil {
			return err
		}
		for _, t := range ts {
			select {
			case listTransactions <- t:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		return nil
	}
}

func main() {
	connStr := "postgres://user:password@localhost:5432/mydb?sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	stmt, err := src.GetStatement(db)
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	listTransactions := make(chan src.Transaction)
	ctx, cancel := context.WithCancelCause(context.Background())
	var gr errgroup.Group
	gr.Go(func() error { return loadTransactions(stmt, listTransactions, cancel) })

	gr.Go(func() error {
		defer close(listTransactions)
		var gr2 errgroup.Group
		gr2.Go(load(listTransactions, ctx, "data/t1.json"))
		gr2.Go(load(listTransactions, ctx, "data/t2.json"))
		gr2.Go(load(listTransactions, ctx, "data/t3.json"))
		gr2.Go(load(listTransactions, ctx, "data/t4.json"))
		err := gr2.Wait()
		return err
	})

	if err = gr.Wait(); err != nil {
		log.Fatal(err)
	}
}
