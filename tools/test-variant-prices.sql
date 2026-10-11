-- Read-only regression cases using the RPC's actual variant-selection expression.
with cases(base,variants,choice,expected) as (values
(119::numeric,'[{"color":"red","price":99}]'::jsonb,'{"color":"red"}'::jsonb,99::numeric),
(119,'[{"color":"red","price":99}]','{"color":"blue"}',119),
(119,'[{"size":"7","style":"long","price":139}]','{"size":"7 - long"}',139),
(119,'[{"price":0}]','{}',119),
(119,'[{"price":null}]','{}',119),
(119,'[{"price":""}]','{}',119),
(119,'[{"price":-1}]','{}',119),
(119,'[]','{}',119)
) select base,expected,coalesce(result.price,base) as actual,coalesce(result.price,base)=expected as passed from cases left join lateral (    select case when coalesce(nullif(variant.value->>'price','')::numeric,0)>0
      then (variant.value->>'price')::numeric else cases.base end as price
    from jsonb_array_elements(coalesce(cases.variants,'[]'::jsonb)) with ordinality variant(value,position)
    where (coalesce(variant.value->>'color','')='' or variant.value->>'color'=coalesce(cases.choice->>'color',''))
      and (concat_ws(' - ',nullif(variant.value->>'size',''),nullif(variant.value->>'style',''))=''
        or concat_ws(' - ',nullif(variant.value->>'size',''),nullif(variant.value->>'style',''))=coalesce(cases.choice->>'size',''))
    order by variant.position limit 1) result on true;
