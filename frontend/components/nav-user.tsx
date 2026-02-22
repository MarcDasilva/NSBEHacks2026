"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import {
  IconCreditCard,
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconLogout,
  IconNotification,
  IconPlus,
  IconTrash,
  IconUserCircle,
} from "@tabler/icons-react"

import { getSupabase } from "@/lib/supabase/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

type WalletEntry = { id: string; name: string }

export function NavUser({
  user,
  onLogout,
  onAccountSaved,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  onLogout?: () => void
  onAccountSaved?: (updates: { name: string; avatar: string }) => void
}) {
  const { isMobile } = useSidebar()
  const [accountOpen, setAccountOpen] = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)
  const [displayName, setDisplayName] = useState(user.name)
  const [phone, setPhone] = useState("")
  const [avatarUrl, setAvatarUrl] = useState(user.avatar)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [wallets, setWallets] = useState<WalletEntry[]>([])
  const [visibleWalletIds, setVisibleWalletIds] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleWalletIdVisible = (index: number) => {
    setVisibleWalletIds((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const loadAccount = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser?.id) return
    const { data: row } = await supabase
      .from("users")
      .select("display_name, phone, avatar_url")
      .eq("id", authUser.id)
      .single()
    if (row) {
      if (row.display_name != null) setDisplayName(row.display_name)
      if (row.phone != null) setPhone(row.phone)
      if (row.avatar_url != null) setAvatarUrl(row.avatar_url)
    }
  }, [])

  const loadWallets = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser?.id) return
    const { data: rows, error } = await supabase
      .from("wallets")
      .select("name, wallet_id")
      .eq("user_id", authUser.id)
      .order("created_at")
    if (error) {
      setWallets([])
      return
    }
    setWallets(
      (rows ?? []).map((r) => ({ name: r.name ?? "", id: r.wallet_id ?? "" }))
    )
  }, [])

  useEffect(() => {
    if (accountOpen) {
      loadAccount()
      setAvatarFile(null)
    }
  }, [accountOpen, loadAccount])

  useEffect(() => {
    if (billingOpen) loadWallets()
  }, [billingOpen, loadWallets])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      setAvatarUrl(URL.createObjectURL(file))
    }
  }

  const addWallet = () => {
    setWallets((prev) => [...prev, { id: "", name: "" }])
  }

  const updateWallet = (index: number, field: "id" | "name", value: string) => {
    setWallets((prev) =>
      prev.map((w, i) => (i === index ? { ...w, [field]: value } : w))
    )
  }

  const removeWallet = (index: number) => {
    setWallets((prev) => prev.filter((_, i) => i !== index))
  }

  const saveAccount = async () => {
    setSaveError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setSaveError("Not connected")
      return
    }
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser?.id) {
      setSaveError("Not signed in")
      return
    }
    setSaving(true)
    try {
      let finalAvatarUrl = avatarUrl
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg"
        const path = `${authUser.id}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
          finalAvatarUrl = urlData.publicUrl
        } else {
          finalAvatarUrl = user.avatar
        }
      }
      const { error } = await supabase.from("users").upsert(
        {
          id: authUser.id,
          display_name: displayName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: finalAvatarUrl || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      if (error) throw error
      onAccountSaved?.({ name: displayName.trim() || user.name, avatar: finalAvatarUrl || user.avatar })
      setAccountOpen(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const saveBilling = async () => {
    setSaveError(null)
    const supabase = getSupabase()
    if (!supabase) {
      setSaveError("Not connected")
      return
    }
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser?.id) {
      setSaveError("Not signed in")
      return
    }
    setSaving(true)
    try {
      // Ensure user row exists so wallets FK is satisfied (wallets.user_id -> users.id)
      const { error: userError } = await supabase.from("users").upsert(
        { id: authUser.id, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      )
      if (userError) throw userError

      const { error: deleteError } = await supabase
        .from("wallets")
        .delete()
        .eq("user_id", authUser.id)
      if (deleteError) throw deleteError
      const valid = wallets.filter((w) => w.name.trim() || w.id.trim())
      if (valid.length > 0) {
        const { error: insertError } = await supabase.from("wallets").insert(
          valid.map((w) => ({
            user_id: authUser.id,
            name: w.name.trim() || "Unnamed",
            wallet_id: w.id.trim(),
          }))
        )
        if (insertError) throw insertError
      }
      setBillingOpen(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save wallets"
      setSaveError(msg.includes("does not exist") ? "Wallets table missing. Run the Supabase schema (users + wallets) in SQL Editor." : msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
                <IconUserCircle />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBillingOpen(true)}>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Account dialog: profile picture, display name, phone only */}
        <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Account</DialogTitle>
              <DialogDescription>
                Update your profile information.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-6 py-2">
              <div className="flex flex-col gap-2">
                <Label>Profile picture</Label>
                <div className="flex items-center gap-3">
                  <Avatar className="h-16 w-16 rounded-lg">
                    <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                    <AvatarFallback className="rounded-lg text-lg">
                      {displayName.slice(0, 2).toUpperCase() || "CN"}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="account-display-name">Display name</Label>
                <Input
                  id="account-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="rounded-md"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="account-phone">Phone number</Label>
                <Input
                  id="account-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="rounded-md"
                />
              </div>
            </div>

            {saveError && (
              <p className="text-destructive text-sm">{saveError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAccountOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveAccount} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Billing dialog: wallets only — Geist (package) font, Name above Wallet ID */}
        <Dialog open={billingOpen} onOpenChange={setBillingOpen}>
          <DialogContent
            className="sm:max-w-md [font-family:var(--font-geist-sans)]"
          >
            <DialogHeader>
              <DialogTitle className="[font-family:var(--font-geist-sans)]">
                Billing
              </DialogTitle>
              <DialogDescription className="[font-family:var(--font-geist-sans)]">
                Manage your wallet IDs for payments.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2 [font-family:var(--font-geist-sans)]">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label className="[font-family:var(--font-geist-sans)]">
                    Wallets
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addWallet}
                    className="gap-1.5 [font-family:var(--font-geist-sans)]"
                  >
                    <IconPlus className="size-4" />
                    Add wallet
                  </Button>
                </div>
                <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
                  {wallets.length === 0 ? (
                    <p className="text-muted-foreground text-sm [font-family:var(--font-geist-sans)]">
                      No wallets added. Click &quot;Add wallet&quot; to add one.
                    </p>
                  ) : (
                    wallets.map((wallet, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-3 rounded-md border bg-background p-3 [font-family:var(--font-geist-sans)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="grid w-full flex-1 gap-2">
                            <Label className="text-xs [font-family:var(--font-geist-sans)]">
                              Name
                            </Label>
                            <Input
                              value={wallet.name}
                              onChange={(e) =>
                                updateWallet(index, "name", e.target.value)
                              }
                              placeholder="e.g. Main wallet"
                              className="rounded-md [font-family:var(--font-geist-sans)]"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0 text-muted-foreground hover:text-destructive mt-6 [font-family:var(--font-geist-sans)]"
                            onClick={() => removeWallet(index)}
                          >
                            <IconTrash className="size-4" />
                            <span className="sr-only">Remove wallet</span>
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs [font-family:var(--font-geist-sans)]">
                            Wallet ID
                          </Label>
                          <div className="relative flex items-center">
                            <Input
                              type={visibleWalletIds.has(index) ? "text" : "password"}
                              value={wallet.id}
                              onChange={(e) =>
                                updateWallet(index, "id", e.target.value)
                              }
                              placeholder="Wallet address or ID"
                              className="rounded-md pr-9 text-sm [font-family:var(--font-geist-sans)]"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full shrink-0 text-muted-foreground hover:text-foreground [font-family:var(--font-geist-sans)]"
                              onClick={() => toggleWalletIdVisible(index)}
                            >
                              {visibleWalletIds.has(index) ? (
                                <IconEyeOff className="size-4" aria-hidden />
                              ) : (
                                <IconEye className="size-4" aria-hidden />
                              )}
                              <span className="sr-only">
                                {visibleWalletIds.has(index)
                                  ? "Hide wallet ID"
                                  : "Show wallet ID"}
                              </span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {saveError && (
              <p className="text-destructive text-sm [font-family:var(--font-geist-sans)]">
                {saveError}
              </p>
            )}

            <DialogFooter className="[font-family:var(--font-geist-sans)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBillingOpen(false)}
                disabled={saving}
                className="[font-family:var(--font-geist-sans)]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveBilling}
                disabled={saving}
                className="[font-family:var(--font-geist-sans)]"
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
