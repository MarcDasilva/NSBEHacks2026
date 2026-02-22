import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { BuyOrderDialog } from '@/components/buy-order-dialog'
import { SellOrderDialog } from '@/components/sell-order-dialog'

const TOKEN_CONFIG = {
  currency: "GGK",
  issuer: "rUpuaJVFUFhw9Dy7X7SwJgw19PpG7BJ1kE",
};

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Documents</h1>
        <div className="ml-auto flex items-center gap-2">
          <BuyOrderDialog
            tokenConfig={TOKEN_CONFIG}
            trigger={
              <Button size="sm" className="bg-green-600 hover:bg-green-700">
                Buy Tokens
              </Button>
            }
          />
          <SellOrderDialog
            tokenConfig={TOKEN_CONFIG}
            trigger={
              <Button variant="default" size="sm">
                Sell Tokens
              </Button>
            }
          />
          <Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(examples)/dashboard"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              GitHub
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}
