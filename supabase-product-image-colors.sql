alter table public.product_images
  add column if not exists color_value text;

alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

comment on column public.product_images.color_value is
  'Optional Hebrew color option linked to this product image.';

comment on column public.products.variants is
  'Optional combinations of color, size and style with a price override.';
