CREATE TABLE transaction_photos (
    photo_id SERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE CASCADE
);