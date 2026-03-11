"use client"

import { Box, Gift, Package, ShoppingBag } from "lucide-react"

const ICONS = [Package, Box, Gift, ShoppingBag] as const
const HUES = [270, 200, 280, 160, 45, 340] as const

function hash(str: string): number {
    let h = 0
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0
    }
    return h
}

interface ProductImagePlaceholderProps {
    productId: string
    productName: string
    size?: "xs" | "sm" | "md"
    className?: string
}

export function ProductImagePlaceholder({ productId, productName, size = "sm", className }: ProductImagePlaceholderProps) {
    const h = hash(productId)
    const hue = HUES[Math.abs(h) % HUES.length]
    const Icon = ICONS[Math.abs(h >> 8) % ICONS.length]
    const boxSize = size === "xs" ? "h-12 w-12" : size === "sm" ? "h-20 w-20" : "h-28 w-28"
    const iconSize = size === "xs" ? "h-5 w-5" : size === "sm" ? "h-9 w-9" : "h-14 w-14"
    const rounded = size === "xs" ? "rounded-lg" : size === "sm" ? "rounded-3xl" : "rounded-[2rem]"

    return (
        <div className={`flex items-center justify-center ${className ?? ""}`} role="img" aria-label={productName || "Product"}>
            <div
                className={`relative flex ${boxSize} items-center justify-center ${rounded} shadow-inner ring-1 ring-black/5 dark:ring-white/10`}
                style={{
                    background: `linear-gradient(135deg, oklch(0.94 0.04 ${hue}), oklch(0.88 0.06 ${hue}))`,
                }}
            >
                <Icon
                    className={`${iconSize} opacity-50`}
                    strokeWidth={1.5}
                    style={{ color: `oklch(0.5 0.2 ${hue})` }}
                />
                {size !== "xs" && (
                    <div
                        className="pointer-events-none absolute -right-3 -top-3 h-8 w-8 rounded-full blur-lg opacity-40"
                        style={{ background: `oklch(0.6 0.15 ${hue})` }}
                    />
                )}
                {size === "md" && (
                    <div
                        className="pointer-events-none absolute -bottom-3 -left-3 h-10 w-10 rounded-full blur-xl opacity-30"
                        style={{ background: `oklch(0.65 0.12 ${(hue + 180) % 360})` }}
                    />
                )}
            </div>
        </div>
    )
}
