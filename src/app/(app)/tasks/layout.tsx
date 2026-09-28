import { SubNav } from "@/components/nav";
import { t } from "@/i18n";

export default function TasksLayout({ children }: LayoutProps<"/tasks">) {
  return (
    <>
      <SubNav
        items={[
          { href: "/tasks", label: t.nav.myTasks, exact: true },
          { href: "/tasks/projects", label: t.nav.projects },
          { href: "/tasks/before", label: t.nav.before },
        ]}
      />
      {children}
    </>
  );
}
