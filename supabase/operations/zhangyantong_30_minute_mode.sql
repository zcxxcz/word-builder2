-- Put zhangyantong@qq.com into the light 30-minute study preset.
-- Run from the Supabase SQL editor or another service-role context.

INSERT INTO public.user_settings (
  user_id,
  daily_new,
  review_cap,
  relapse_cap,
  updated_at
)
SELECT
  users.id,
  3,
  6,
  3,
  now()
FROM auth.users
WHERE users.email = 'zhangyantong@qq.com'
ON CONFLICT (user_id) DO UPDATE SET
  daily_new = EXCLUDED.daily_new,
  review_cap = EXCLUDED.review_cap,
  relapse_cap = EXCLUDED.relapse_cap,
  updated_at = EXCLUDED.updated_at;
