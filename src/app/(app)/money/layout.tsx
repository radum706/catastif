import { SubNav } from "@/components/nav";
import { t } from "@/i18n";

export default function MoneyLayout({ children }: LayoutProps<"/money">) {
  return (
    <>
      <SubNav
        items={[
          { href: "/money", label: t.nav.overview, exact: true },
          { href: "/money/bills", label: t.nav.bills },
          { href: "/money/collect", label: t.nav.collect },
          { href: "/money/transactions", label: t.nav.transactions },
          { href: "/money/forecast", label: t.nav.forecast },
        ]}
      />
      {children}
    </>
  );
}
