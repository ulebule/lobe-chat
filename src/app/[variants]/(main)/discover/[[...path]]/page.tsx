import dynamic from 'next/dynamic';

import { BrandTextLoading } from '@/components/Loading';
import StructuredData from '@/components/StructuredData';
import { Locales } from '@/locales/resources';
import { ldModule } from '@/server/ld';
import { metadataModule } from '@/server/metadata';
import { translation } from '@/server/translation';
import { DynamicLayoutProps } from '@/types/next';
import { RouteVariants } from '@/utils/server/routeVariants';

const DiscoverRouter = dynamic(() => import('../DiscoverRouter'), {
  loading: BrandTextLoading,
  ssr: false,
});

interface DiscoverPageProps extends DynamicLayoutProps {
  params: Promise<{ path?: string[]; variants: string }>;
  searchParams: Promise<{ hl?: Locales }>;
}

const getSharedProps = async (props: DiscoverPageProps) => {
  const searchParams = await props.searchParams;
  const hl = await RouteVariants.getLocale(props);
  const { t, locale } = await translation('metadata', searchParams?.hl || hl);
  return {
    locale,
    t,
  };
};

export const generateMetadata = async (props: DiscoverPageProps) => {
  const params = await props.params;
  // Only generate metadata for the home route (empty/undefined path)
  // Optional catch-all [[...path]] has path as undefined when route is /discover
  if (params.path && params.path.length > 0) {
    return {};
  }

  const { locale, t } = await getSharedProps(props);
  return metadataModule.generate({
    alternate: true,
    description: t('discover.description'),
    locale,
    title: t('discover.title'),
    url: '/discover',
  });
};

const Page = async (props: DiscoverPageProps) => {
  const params = await props.params;
  // Only generate structured data for the home route (empty/undefined path)
  // Optional catch-all [[...path]] has path as undefined when route is /discover
  if (params.path && params.path.length > 0) {
    return <DiscoverRouter />;
  }

  const { locale, t } = await getSharedProps(props);
  const ld = ldModule.generate({
    description: t('discover.description'),
    locale,
    title: t('discover.title'),
    url: '/discover',
    webpage: {
      enable: true,
      search: '/discover/search',
    },
  });

  return (
    <>
      <StructuredData ld={ld} />
      <DiscoverRouter />
    </>
  );
};

Page.DisplayName = 'Discover';

export default Page;
