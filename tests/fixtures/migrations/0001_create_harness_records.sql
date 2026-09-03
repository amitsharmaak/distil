CREATE TABLE harness_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
