import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({children}:{children:React.ReactNode}) {
  return <main id="main" className="docs-layout shell"><DocsSidebar />{children}</main>;
}
