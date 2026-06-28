CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.food_index (
  fdc_id BIGINT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('foundation', 'sr_legacy', 'survey', 'branded')),
  name TEXT NOT NULL,
  search_name TEXT NOT NULL,
  brand TEXT,
  kcal NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  serving_label TEXT,
  serving_amount_g NUMERIC,
  publication_date DATE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS food_index_search_name_trgm_idx
  ON public.food_index USING GIN (search_name public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS food_index_source_idx
  ON public.food_index (source);

ALTER TABLE public.food_index ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_index' AND policyname = 'food index authenticated read'
  ) THEN
    CREATE POLICY "food index authenticated read"
    ON public.food_index
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;

GRANT SELECT ON public.food_index TO authenticated;

CREATE OR REPLACE FUNCTION public.search_food_index(search_query TEXT, max_results INTEGER DEFAULT 20)
RETURNS TABLE (
  fdc_id BIGINT,
  source TEXT,
  name TEXT,
  brand TEXT,
  kcal NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  serving_label TEXT,
  serving_amount_g NUMERIC
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT lower(trim(regexp_replace(coalesce(search_query, ''), '[^[:alnum:]]+', ' ', 'g'))) AS q
  )
  SELECT
    fi.fdc_id,
    fi.source,
    fi.name,
    fi.brand,
    fi.kcal,
    fi.protein,
    fi.carbs,
    fi.fat,
    fi.serving_label,
    fi.serving_amount_g
  FROM public.food_index fi
  CROSS JOIN normalized n
  WHERE n.q <> ''
    AND (
      fi.search_name ILIKE '%' || n.q || '%'
      OR word_similarity(n.q, fi.search_name) > 0.45
    )
  ORDER BY
    CASE
      WHEN fi.search_name = n.q THEN 100
      WHEN fi.search_name LIKE n.q || '%' THEN 80
      WHEN fi.source IN ('foundation', 'sr_legacy') THEN 20
      ELSE 0
    END DESC,
    similarity(fi.search_name, n.q) DESC,
    fi.name ASC
  LIMIT LEAST(GREATEST(max_results, 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_food_index(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_food_index(TEXT, INTEGER) TO authenticated;
