import { Helmet } from "react-helmet-async";

const BASE_URL = "https://charliesbarbershop.co";
const DEFAULT_TITLE = "Charlie's Barbershop — La Barbería #1 en Camuy, PR";
const DEFAULT_DESC = "La barbería #1 en Camuy, PR. Reserva en línea, servicios premium, y más.";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.jpg`;

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  imageWidth?: string;
  imageHeight?: string;
  type?: string;
  noindex?: boolean;
  keywords?: string[] | string;
}

export function SEOHead({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  path = "/",
  image = DEFAULT_IMAGE,
  imageWidth = "1280",
  imageHeight = "720",
  type = "website",
  noindex = false,
  keywords,
}: SEOHeadProps) {
  const url = `${BASE_URL}${path}`;
  const kw = Array.isArray(keywords) ? keywords.filter(Boolean).join(", ") : keywords;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {kw && <meta name="keywords" content={kw} />}
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content={imageWidth} />
      <meta property="og:image:height" content={imageHeight} />
      <meta property="og:site_name" content="Charlie's Barbershop" />
      <meta property="og:locale" content="es_PR" />
      <meta property="og:locale:alternate" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  );
}
