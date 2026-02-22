"use client";

import * as React from "react";
import {
  IconCamera,
  IconChartBar,
  IconDatabase,
  IconFileAi,
  IconFileDescription,
  IconHelp,
  IconListDetails,
  IconPlugConnected,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const data = {
  user: {
    name: "User",
    email: "",
    avatar: "",
  },
  navMain: [
    {
      title: "Connections",
      url: "#",
      icon: IconPlugConnected,
    },
    {
      title: "Order Book",
      url: "/orderbook",
      icon: IconChartCandle,
    },
    {
      title: "Lifecycle",
      url: "#",
      icon: IconListDetails,
    },
    {
      title: "Analytics",
      url: "#",
      icon: IconChartBar,
    },
    {
      title: "Team",
      url: "#",
      icon: IconUsers,
    },
  ],
  navClouds: [
    {
      title: "Capture",
      icon: IconCamera,
      isActive: true,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Proposal",
      icon: IconFileDescription,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
    {
      title: "Prompts",
      icon: IconFileAi,
      url: "#",
      items: [
        {
          title: "Active Proposals",
          url: "#",
        },
        {
          title: "Archived",
          url: "#",
        },
      ],
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "Get Help",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "Search",
      url: "#",
      icon: IconSearch,
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "#",
      icon: IconDatabase,
    },
    {
      name: "Reports",
      url: "#",
      icon: IconReport,
    },
  ],
};

type NavUserData = {
  name: string;
  email: string;
  avatar: string;
};

export function AppSidebar({
  user,
  onLogout,
  onAccountSaved,
  onNavigate,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: NavUserData;
  onLogout?: () => void;
  onAccountSaved?: (updates: { name: string; avatar: string }) => void;
  onNavigate?: (view: "browse" | "dashboard") => void;
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5 overflow-visible [&>a]:overflow-visible [&_span]:overflow-visible"
            >
              <a href="#" className="flex w-full justify-start pt-2.5">
                <span
                  style={{
                    fontFamily: "var(--font-geist-pixel-line)",
                    fontSize: "1.875rem",
                    fontWeight: 500,
                    letterSpacing: "-0.07em",
                    lineHeight: 1.2,
                    color: "#fff",
                    display: "inline-block",
                    paddingBottom: "0.05em",
                  }}
                >
                  apiXchange
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={data.navMain}
          onBrowseApisClick={
            onNavigate ? () => onNavigate("browse") : undefined
          }
          onNavItemClick={
            onNavigate
              ? (title) => {
                  if (title === "Connections") onNavigate("dashboard");
                }
              : undefined
          }
        />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={user}
          onLogout={onLogout}
          onAccountSaved={onAccountSaved}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
