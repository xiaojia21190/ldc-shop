'use client'

import Link from "next/link"
import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Coins, Package, Clock, CheckCircle, ChevronRight, User, LogOut, Bell, Mail, Send, MessageSquarePlus, Settings } from "lucide-react"
import { signOut } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { updateDesktopNotifications, updateProfileEmail } from "@/actions/profile"
import { useEffect, useRef, useState } from "react"
import { CheckInButton } from "@/components/checkin-button"
import { clearMyNotifications, getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/actions/user-notifications"
import { sendUserMessage } from "@/actions/user-messages"
import { cn } from "@/lib/utils"

interface ProfileContentProps {
    user: {
        id: string
        name: string
        username: string | null
        avatar: string | null
        email: string | null
        trustLevel?: number
    }
    points: number
    checkinEnabled: boolean
    orderStats: {
        total: number
        pending: number
        delivered: number
    }
    notifications: Array<{
        id: number
        type: string
        titleKey: string
        contentKey: string
        data: string | null
        isRead: boolean | null
        createdAt: number | null
    }>
    sentMessages: Array<{
        id: number
        title: string
        body: string
        createdAt: number | null
    }>
    desktopNotificationsEnabled: boolean
}

export function ProfileContent({ user, points, checkinEnabled, orderStats, notifications: initialNotifications, sentMessages: initialSentMessages, desktopNotificationsEnabled }: ProfileContentProps) {
    const { t } = useI18n()
    const [email, setEmail] = useState(user.email || '')
    const [savingEmail, setSavingEmail] = useState(false)
    const [pointsValue, setPointsValue] = useState(points)
    const [notifications, setNotifications] = useState(initialNotifications)
    const [markingAll, setMarkingAll] = useState(false)
    const [markingId, setMarkingId] = useState<number | null>(null)
    const [clearing, setClearing] = useState(false)
    const [expandedIds, setExpandedIds] = useState<number[]>([])
    const [msgTitle, setMsgTitle] = useState("")
    const [msgBody, setMsgBody] = useState("")
    const [msgSending, setMsgSending] = useState(false)
    const [showComposeForm, setShowComposeForm] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [desktopEnabled, setDesktopEnabled] = useState(desktopNotificationsEnabled)
    const [desktopSaving, setDesktopSaving] = useState(false)
    const [sentMessages, setSentMessages] = useState(initialSentMessages)
    const [expandedSentIds, setExpandedSentIds] = useState<number[]>([])
    const [msgTab, setMsgTab] = useState<'inbox' | 'sent'>('inbox')
    const notifiedIdsRef = useRef<Set<number>>(new Set())

    const unreadCount = notifications.filter((n) => !n.isRead).length

    const parseNotificationData = (data: string | null) => {
        if (!data) return {}
        try {
            return JSON.parse(data) as { params?: Record<string, string | number>; href?: string; title?: string; body?: string }
        } catch {
            return {}
        }
    }

    const emitNotificationUpdate = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("ldc:notifications-updated"))
        }
    }

    const handleMarkRead = async (id: number) => {
        if (markingId === id) return
        setMarkingId(id)
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
        try {
            const res = await markNotificationRead(id)
            if (!res?.success) {
                setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)))
            }
            emitNotificationUpdate()
        } catch {
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)))
        } finally {
            setMarkingId(null)
        }
    }

    useEffect(() => {
        const refresh = async () => {
            try {
                const res = await getMyNotifications()
                if (res?.success && res.items) {
                    setNotifications(res.items)
                }
            } catch {
                // ignore refresh failures
            }
        }
        refresh()
    }, [])

    useEffect(() => {
        if (!desktopEnabled) return
        if (typeof window === "undefined" || !("Notification" in window)) return
        if (Notification.permission !== "granted") return

        const unread = notifications.filter((n) => !n.isRead)
        const fresh = unread.filter((n) => !notifiedIdsRef.current.has(n.id))
        if (!fresh.length) return

        fresh.slice(0, 3).forEach((n) => {
            const data = parseNotificationData(n.data)
            const params = data.params || {}
            const title = t(n.titleKey, params)
            const body = t(n.contentKey, params)
            new Notification(title, { body })
            notifiedIdsRef.current.add(n.id)
        })
    }, [desktopEnabled, notifications, t])

    const ensureNotificationPermission = async () => {
        if (typeof window === "undefined" || !("Notification" in window)) {
            toast.error(t('profile.desktopNotifications.unsupported'))
            return false
        }
        if (Notification.permission === "granted") return true
        if (Notification.permission === "denied") {
            toast.error(t('profile.desktopNotifications.permissionDenied'))
            return false
        }
        const permission = await Notification.requestPermission()
        if (permission !== "granted") {
            toast.error(t('profile.desktopNotifications.permissionDenied'))
            return false
        }
        return true
    }

    const handleToggleDesktopNotifications = async () => {
        if (desktopSaving) return
        const next = !desktopEnabled
        if (next) {
            const ok = await ensureNotificationPermission()
            if (!ok) return
        }
        setDesktopSaving(true)
        try {
            const res = await updateDesktopNotifications(next)
            if (res?.success) {
                setDesktopEnabled(next)
                toast.success(next ? t('profile.desktopNotifications.enabledToast') : t('profile.desktopNotifications.disabledToast'))
                if (next) {
                    notifiedIdsRef.current = new Set(notifications.map((n) => n.id))
                }
                if (next && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                    new Notification(t('profile.desktopNotifications.testTitle'), {
                        body: t('profile.desktopNotifications.testBody')
                    })
                }
            } else {
                toast.error(res?.error ? t(res.error) : t('common.error'))
            }
        } catch {
            toast.error(t('common.error'))
        } finally {
            setDesktopSaving(false)
        }
    }

    return (
        <main className="container py-8 max-w-2xl space-y-6">
            {/* User Info + Stats */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={user.avatar || ''} alt={user.name} />
                            <AvatarFallback><User className="h-8 w-8" /></AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <h1 className="text-xl font-bold">{user.name}</h1>
                            {user.username && (
                                <p className="text-sm text-muted-foreground">@{user.username}</p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>ID: {user.id}</span>
                                <Badge variant="outline" className="text-xs">
                                    {t('profile.trustLevel')}: {Number.isFinite(Number(user.trustLevel)) ? user.trustLevel : 0}
                                </Badge>
                                <span className="mx-1 text-border">·</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                                    <Coins className="h-3.5 w-3.5" />
                                    {pointsValue}
                                </span>
                            </div>
                            <div className="mt-2">
                                <CheckInButton
                                    enabled={checkinEnabled}
                                    showPoints={false}
                                    showCheckedInLabel
                                    className="flex"
                                    onPointsChange={setPointsValue}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Order Stats inline */}
                    <div className="mt-5 pt-5 border-t">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">{t('common.myOrders')}</span>
                            <Link href="/orders">
                                <Button variant="ghost" size="sm" className="text-muted-foreground h-7 text-xs">
                                    {t('common.viewOrders')} <ChevronRight className="h-3 w-3 ml-0.5" />
                                </Button>
                            </Link>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="p-2.5 rounded-lg bg-muted/50">
                                <Package className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                                <p className="text-xl font-bold">{orderStats.total}</p>
                                <p className="text-[11px] text-muted-foreground">{t('admin.stats.total')}</p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-muted/50">
                                <Clock className="h-4 w-4 mx-auto mb-1 text-yellow-600" />
                                <p className="text-xl font-bold">{orderStats.pending}</p>
                                <p className="text-[11px] text-muted-foreground">{t('order.status.pending')}</p>
                            </div>
                            <div className="p-2.5 rounded-lg bg-muted/50">
                                <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-600" />
                                <p className="text-xl font-bold">{orderStats.delivered}</p>
                                <p className="text-[11px] text-muted-foreground">{t('order.status.delivered')}</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Messages: Inbox + Sent + Compose */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <Button
                                variant={msgTab === 'inbox' ? 'default' : 'ghost'}
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setMsgTab('inbox')}
                            >
                                <Bell className="h-3.5 w-3.5" />
                                {t('profile.inboxTitle')}
                                {unreadCount > 0 && (
                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white px-1">
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </Button>
                            <Button
                                variant={msgTab === 'sent' ? 'default' : 'ghost'}
                                size="sm"
                                className="gap-1.5"
                                onClick={() => setMsgTab('sent')}
                            >
                                <Send className="h-3.5 w-3.5" />
                                {t('profile.sentTitle')}
                                {sentMessages.length > 0 && (
                                    <span className="text-xs text-muted-foreground">({sentMessages.length})</span>
                                )}
                            </Button>
                        </div>
                        <div className="flex items-center gap-1">
                            {msgTab === 'inbox' && notifications.length > 0 && (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        disabled={markingAll || unreadCount === 0}
                                        onClick={async () => {
                                            if (markingAll || unreadCount === 0) return
                                            setMarkingAll(true)
                                            try {
                                                const res = await markAllNotificationsRead()
                                                if (res?.success) {
                                                    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
                                                    emitNotificationUpdate()
                                                    toast.success(t('profile.inboxMarked'))
                                                } else {
                                                    toast.error(t('common.error'))
                                                }
                                            } catch {
                                                toast.error(t('common.error'))
                                            } finally {
                                                setMarkingAll(false)
                                            }
                                        }}
                                    >
                                        {t('profile.markAllRead')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        disabled={clearing}
                                        onClick={async () => {
                                            if (clearing) return
                                            setClearing(true)
                                            try {
                                                const res = await clearMyNotifications()
                                                if (res?.success) {
                                                    setNotifications([])
                                                    emitNotificationUpdate()
                                                    toast.success(t('profile.inboxCleared'))
                                                } else {
                                                    toast.error(t('common.error'))
                                                }
                                            } catch {
                                                toast.error(t('common.error'))
                                            } finally {
                                                setClearing(false)
                                            }
                                        }}
                                    >
                                        {t('profile.clearInbox')}
                                    </Button>
                                </>
                            )}
                            <Button
                                variant={showComposeForm ? 'secondary' : 'outline'}
                                size="sm"
                                className="gap-1.5 h-7"
                                onClick={() => setShowComposeForm(!showComposeForm)}
                            >
                                <MessageSquarePlus className="h-3.5 w-3.5" />
                                {t('profile.messages.compose')}
                            </Button>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/* Compose Form (collapsible) */}
                    {showComposeForm && (
                        <div className="mb-4 rounded-lg border p-4 space-y-3 bg-muted/30">
                            <h4 className="text-sm font-medium">{t('profile.messages.title')}</h4>
                            <Input
                                value={msgTitle}
                                onChange={(e) => setMsgTitle(e.target.value)}
                                placeholder={t('profile.messages.titlePlaceholder')}
                                disabled={msgSending}
                            />
                            <Textarea
                                className="min-h-[100px] resize-none"
                                placeholder={t('profile.messages.bodyPlaceholder')}
                                value={msgBody}
                                onChange={(e) => setMsgBody(e.target.value)}
                                disabled={msgSending}
                            />
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => setShowComposeForm(false)}>
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={msgSending}
                                    onClick={async () => {
                                        if (msgSending) return
                                        setMsgSending(true)
                                        try {
                                            const res = await sendUserMessage(msgTitle, msgBody)
                                            if (res?.success) {
                                                toast.success(t('profile.messages.sent'))
                                                setSentMessages((prev) => [{
                                                    id: Date.now(),
                                                    title: msgTitle,
                                                    body: msgBody,
                                                    createdAt: Date.now()
                                                }, ...prev])
                                                setMsgTitle("")
                                                setMsgBody("")
                                                setShowComposeForm(false)
                                            } else {
                                                toast.error(res?.error ? t(res.error) : t('common.error'))
                                            }
                                        } catch {
                                            toast.error(t('common.error'))
                                        } finally {
                                            setMsgSending(false)
                                        }
                                    }}
                                >
                                    {msgSending ? t('common.processing') : t('profile.messages.send')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Inbox Tab */}
                    {msgTab === 'inbox' && (
                        notifications.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">{t('profile.inboxEmpty')}</p>
                        ) : (
                            <div className="space-y-2">
                                {notifications.map((n) => {
                                    const meta = parseNotificationData(n.data)
                                    const params = meta.params || {}
                                    const title = typeof meta.title === "string" && meta.title.trim()
                                        ? meta.title
                                        : t(n.titleKey, params)
                                    const content = typeof meta.body === "string" && meta.body.trim()
                                        ? meta.body
                                        : t(n.contentKey, params)
                                    const time = n.createdAt ? new Date(n.createdAt).toLocaleString() : '-'
                                    const isExpanded = expandedIds.includes(n.id)
                                    const contentClass = cn(
                                        "text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap",
                                        !isExpanded ? "line-clamp-2" : ""
                                    )
                                    const body = (
                                        <div className={`rounded-lg border p-3 ${n.isRead ? "bg-muted/30" : "bg-primary/5 border-primary/30"}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm">{title}</span>
                                                        {!n.isRead && (
                                                            <Badge variant="outline" className="text-[10px] text-primary border-primary/50">
                                                                {t('profile.unread')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className={contentClass}>{content}</p>
                                                    <p className="text-xs text-muted-foreground mt-1.5">{time}</p>
                                                </div>
                                                {meta.href && (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                                )}
                                            </div>
                                        </div>
                                    )

                                    return meta.href ? (
                                        <Link
                                            key={n.id}
                                            href={meta.href}
                                            className="block"
                                            onClick={() => {
                                                if (!n.isRead) void handleMarkRead(n.id)
                                            }}
                                        >
                                            {body}
                                        </Link>
                                    ) : (
                                        <div
                                            key={n.id}
                                            className="cursor-pointer"
                                            onClick={() => {
                                                if (!n.isRead) void handleMarkRead(n.id)
                                                setExpandedIds((prev) =>
                                                    prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id]
                                                )
                                            }}
                                        >
                                            {body}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    )}

                    {/* Sent Tab */}
                    {msgTab === 'sent' && (
                        sentMessages.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">{t('profile.sentEmpty')}</p>
                        ) : (
                            <div className="space-y-2">
                                {sentMessages.map((m) => {
                                    const isExpanded = expandedSentIds.includes(m.id)
                                    return (
                                        <div
                                            key={m.id}
                                            className="rounded-lg border p-3 bg-muted/30 cursor-pointer"
                                            onClick={() =>
                                                setExpandedSentIds((prev) =>
                                                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                                                )
                                            }
                                        >
                                            <div className="flex items-center gap-2">
                                                <Send className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <span className="font-medium text-sm truncate">{m.title || t('profile.messages.noTitle')}</span>
                                            </div>
                                            <p className={cn(
                                                "text-sm text-muted-foreground mt-1 break-words whitespace-pre-wrap",
                                                !isExpanded ? "line-clamp-2" : ""
                                            )}>
                                                {m.body}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1.5">
                                                {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    )}
                </CardContent>
            </Card>

            {/* Settings (collapsible) */}
            <Card>
                <CardHeader className="pb-0">
                    <CardTitle
                        className="text-base flex items-center justify-between cursor-pointer"
                        onClick={() => setShowSettings(!showSettings)}
                    >
                        <span className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            {t('profile.settingsTitle')}
                        </span>
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showSettings && "rotate-90")} />
                    </CardTitle>
                </CardHeader>
                {showSettings && (
                    <CardContent className="pt-4 space-y-5">
                        {/* Email */}
                        <div>
                            <Label htmlFor="profile-email" className="text-sm font-medium">{t('profile.emailTitle')}</Label>
                            <div className="mt-2 flex gap-2">
                                <Input
                                    id="profile-email"
                                    type="email"
                                    placeholder={t('profile.emailLabel')}
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={savingEmail}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={savingEmail}
                                    onClick={async () => {
                                        setSavingEmail(true)
                                        try {
                                            const result = await updateProfileEmail(email)
                                            if (result?.success) {
                                                toast.success(t('profile.emailSaved'))
                                            } else {
                                                toast.error(result?.error ? t(result.error) : t('common.error'))
                                            }
                                        } catch {
                                            toast.error(t('common.error'))
                                        } finally {
                                            setSavingEmail(false)
                                        }
                                    }}
                                >
                                    {t('profile.emailSave')}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{t('profile.emailHint')}</p>
                        </div>

                        {/* Desktop Notifications */}
                        <div className="flex items-center justify-between gap-4 pt-2 border-t">
                            <div>
                                <p className="text-sm font-medium">{t('profile.desktopNotifications.title')}</p>
                                <p className="text-xs text-muted-foreground">{t('profile.desktopNotifications.desc')}</p>
                            </div>
                            <Button
                                type="button"
                                variant={desktopEnabled ? "default" : "outline"}
                                size="sm"
                                onClick={handleToggleDesktopNotifications}
                                disabled={desktopSaving}
                            >
                                {desktopEnabled ? t('profile.desktopNotifications.enabled') : t('profile.desktopNotifications.disabled')}
                            </Button>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Logout */}
            <Button
                variant="outline"
                className="w-full"
                onClick={() => signOut({ callbackUrl: "/" })}
            >
                <LogOut className="h-4 w-4 mr-2" />
                {t('common.logout')}
            </Button>
        </main>
    )
}
