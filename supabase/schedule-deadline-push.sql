-- Execute somente depois de implantar send-deadline-push e configurar as Edge Function Secrets.
-- Substitua PREENCHA_COM_A_MESMA_CHAVE pelo valor salvo em DEADLINE_PUSH_CRON_SECRET.
-- Execute esta configuração uma única vez.
create schema if not exists extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://rcmssdqsbbxpjgumblfb.supabase.co',
  'deadline_push_project_url'
);
select vault.create_secret(
  'PREENCHA_COM_A_MESMA_CHAVE',
  'deadline_push_cron_secret'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'send-shared-activity-deadline-push';

select cron.schedule(
  'send-shared-activity-deadline-push',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deadline_push_project_url')
      || '/functions/v1/send-deadline-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_T4kY4VYtmlnl5dEdSIiIaw_jvGl1dym',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'deadline_push_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $job$
);
