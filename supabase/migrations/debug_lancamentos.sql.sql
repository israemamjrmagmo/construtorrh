SELECT id, colaborador_id, obra_id, mes_referencia, status FROM public.ponto_lancamentos LIMIT 10;
SELECT mes_referencia, count(*) FROM public.ponto_lancamentos GROUP BY 1;