"use client"

import { IconMail, IconServer, type Icon } from "@tabler/icons-react"

import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function NavMain({
  items,
  onBrowseApisClick,
  onNavItemClick,
}: {
  items: {
    title: string
    url: string
    icon?: Icon
  }[]
  onBrowseApisClick?: () => void
  onNavItemClick?: (title: string) => void
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Browse APIs"
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
              asChild={!!onBrowseApisClick}
            >
              {onBrowseApisClick ? (
                <button type="button" onClick={onBrowseApisClick}>
                  <IconServer />
                  <span>Browse APIs</span>
                </button>
              ) : (
                <>
                  <IconServer />
                  <span>Browse APIs</span>
                </>
              )}
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconMail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                tooltip={item.title}
                asChild={!!onNavItemClick}
              >
                {onNavItemClick ? (
                  <button
                    type="button"
                    onClick={() => onNavItemClick(item.title)}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </button>
                ) : (
                  <>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
