"use client";

import { useCallback, useEffect, useState } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconWallet,
  IconKey,
  IconCertificate,
  IconGauge,
  IconBell,
  IconRefresh,
  IconDatabase,
  IconShieldCheck,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";

/** API providers for the dropdown (id, symbol, logo). Matches browse list. */
export const API_PROVIDERS: { id: string; symbol: string; logo: string }[] = [
  { id: "openai", symbol: "OpenAI", logo: "/logos/openai-white.png" },
  { id: "anthropic", symbol: "Anthropic", logo: "/logos/claude-color.png" },
  { id: "google", symbol: "Google AI", logo: "/logos/gemini-color.png" },
  { id: "twilio", symbol: "Twilio", logo: "/logos/Twilio-Symbol.png" },
  { id: "elevenlabs", symbol: "ElevenLabs", logo: "/logos/elevenlabs-symbol.svg" },
  { id: "mistral", symbol: "Mistral", logo: "/logos/mistral.png" },
  { id: "cohere", symbol: "Cohere", logo: "/logos/cohere.png" },
  { id: "polygon", symbol: "Polygon", logo: "/logos/polygon.jpeg" },
  { id: "deepl", symbol: "DeepL", logo: "/logos/DeepL-Icon-Logo-Vector.svg--240x300.png" },
  { id: "gradium", symbol: "Gradium", logo: "/logos/gradium.png" },
  { id: "alpha-vantage", symbol: "Alpha Vantage", logo: "/logos/alpha%20vantage.png" },
  { id: "gecko", symbol: "Gecko", logo: "/logos/gecko-405ed53b475f61244130f95742a07da15f7ac30feeed5072812ae5c2d73b6194.svg" },
  { id: "google-maps", symbol: "Google Maps", logo: "/logos/Google_Maps_icon_(2020).svg.png" },
  { id: "clearbit", symbol: "Clearbit", logo: "/logos/clearbit.webp" },
];

const NODE_STYLE =
  "rounded-lg border border-[#404040] bg-[#252525] px-4 py-3 min-w-[200px] shadow-lg";
const LABEL_STYLE = "text-xs font-medium text-[#888] uppercase tracking-wider mb-1.5";
const HANDLE_STYLE = "!w-3 !h-3 !border-2 !border-[#404040] !bg-[#1a1a1a]";

export function WalletNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [walletOptions, setWalletOptions] = useState<{ value: string; label: string }[]>([]);
  const [wallet, setWallet] = useState((props.data?.wallet as string) ?? "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setWalletOptions([]);
        setLoading(false);
        return;
      }
      const { data: rows, error } = await supabase
        .from("wallets")
        .select("name, wallet_id")
        .eq("user_id", user.id)
        .order("created_at");
      if (cancelled) return;
      if (error) {
        setWalletOptions([]);
        setLoading(false);
        return;
      }
      const list = (rows ?? []).map((r) => ({
        value: r.wallet_id ?? "",
        label: (r.name?.trim() || r.wallet_id) ?? "Unnamed",
      }));
      setWalletOptions(list);
      if (list.length > 0 && (wallet === "" || !list.some((o) => o.value === wallet))) {
        setWallet(list[0].value);
        setNodes((nds) =>
          nds.map((n) =>
            n.id === props.id ? { ...n, data: { ...n.data, wallet: list[0].value } } : n
          )
        );
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const onWalletChange = useCallback(
    (value: string) => {
      const actual = value === "__no_wallets__" ? "" : value;
      setWallet(actual);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, wallet: actual } } : n
        )
      );
    },
    [props.id, setNodes]
  );

  const NO_WALLETS_VALUE = "__no_wallets__";
  const options = walletOptions.length > 0
    ? walletOptions.filter((o) => o.value !== "").map((o) => ({ value: o.value, label: o.label }))
    : [{ value: NO_WALLETS_VALUE, label: "No wallets registered" }];
  const selectValue = walletOptions.some((o) => o.value === wallet) ? wallet : (options[0]?.value ?? NO_WALLETS_VALUE);

  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Wallet</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconWallet className="size-4 shrink-0 text-[#888]" />
        <span>Connect wallet for payments</span>
      </div>
      <Select
        value={selectValue}
        onValueChange={onWalletChange}
        disabled={loading || walletOptions.length === 0}
      >
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder={loading ? "Loading…" : "Select wallet"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

export function ApiProviderNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [providerId, setProviderId] = useState((props.data?.providerId as string) ?? API_PROVIDERS[0]?.id ?? "");
  const [key, setKey] = useState((props.data?.apiKey as string) ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const selectedProvider = API_PROVIDERS.find((p) => p.id === providerId) ?? API_PROVIDERS[0];
  const onProviderChange = useCallback(
    (value: string) => {
      setProviderId(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, providerId: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  const onKeyChange = useCallback(
    (value: string) => {
      setKey(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, apiKey: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>API Provider</div>
      <Select value={providerId || undefined} onValueChange={onProviderChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan mb-2">
          <SelectValue placeholder="Select provider">
            {selectedProvider && (
              <span className="flex items-center gap-2">
                <img src={selectedProvider.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                <span>{selectedProvider.symbol}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {API_PROVIDERS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <img src={p.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                <span>{p.symbol}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative">
        <Input
          type={keyVisible ? "text" : "password"}
          placeholder="Enter API key"
          value={key}
          onChange={(e) => onKeyChange(e.target.value)}
          className="h-8 pr-9 text-xs bg-[#1a1a1a] border-[#404040] text-white placeholder:text-[#666] nodrag nopan"
        />
        <button
          type="button"
          onClick={() => setKeyVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] hover:text-white nodrag nopan"
          aria-label={keyVisible ? "Hide key" : "Show key"}
        >
          {keyVisible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
        </button>
      </div>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

export function ProxyKeyNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [providerId, setProviderId] = useState((props.data?.providerId as string) ?? API_PROVIDERS[0]?.id ?? "");
  const [proxyKey, setProxyKey] = useState((props.data?.proxyKey as string) ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const selectedProvider = API_PROVIDERS.find((p) => p.id === providerId) ?? API_PROVIDERS[0];

  const onProviderChange = useCallback(
    (value: string) => {
      setProviderId(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, providerId: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );

  const syncProxyKey = useCallback(
    (value: string) => {
      setProxyKey(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, proxyKey: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );

  const onGenerate = useCallback(() => {
    const key =
      "pk_" +
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    syncProxyKey(key);
  }, [syncProxyKey]);

  const hasKey = proxyKey.length > 0;

  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Proxy key</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconCertificate className="size-4 shrink-0 text-[#888]" />
        <span>
          {hasKey ? "Proxy key for this provider" : "Generate proxy key for this provider"}
        </span>
      </div>
      <Select value={providerId || undefined} onValueChange={onProviderChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan mb-2">
          <SelectValue placeholder="Select provider">
            {selectedProvider && (
              <span className="flex items-center gap-2">
                <img src={selectedProvider.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                <span>{selectedProvider.symbol}</span>
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {API_PROVIDERS.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex items-center gap-2">
                <img src={p.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
                <span>{p.symbol}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasKey ? (
        <div className="relative">
          <Input
            type={keyVisible ? "text" : "password"}
            value={proxyKey}
            readOnly
            className="h-8 pr-9 text-xs bg-[#1a1a1a] border-[#404040] text-white nodrag nopan"
          />
          <button
            type="button"
            onClick={() => setKeyVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888] hover:text-white nodrag nopan"
            aria-label={keyVisible ? "Hide key" : "Show key"}
          >
            {keyVisible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          className="w-full rounded border border-[#404040] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-white hover:bg-[#2a2a2a] nodrag nopan"
        >
          Generate proxy key
        </button>
      )}
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

const RATE_LIMIT_OPTIONS = [
  { value: "10", label: "10 req/min" },
  { value: "50", label: "50 req/min" },
  { value: "100", label: "100 req/min" },
  { value: "500", label: "500 req/min" },
  { value: "1000", label: "1000 req/min" },
];

export function RateLimitNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [limit, setLimit] = useState((props.data?.limit as string) ?? "100");
  const onLimitChange = useCallback(
    (value: string) => {
      setLimit(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, limit: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Rate limiting</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconGauge className="size-4 shrink-0 text-[#888]" />
        <span>Throttle requests per minute</span>
      </div>
      <Select value={limit} onValueChange={onLimitChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder="Limit" />
        </SelectTrigger>
        <SelectContent>
          {RATE_LIMIT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

const ALERTS_OPTIONS = [
  { value: "budget", label: "Budget only" },
  { value: "errors", label: "Errors only" },
  { value: "both", label: "Budget & errors" },
  { value: "webhook", label: "Webhook" },
];

export function AlertsNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [alertType, setAlertType] = useState((props.data?.alertType as string) ?? "both");
  const onAlertTypeChange = useCallback(
    (value: string) => {
      setAlertType(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, alertType: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Alerts</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconBell className="size-4 shrink-0 text-[#888]" />
        <span>Notify on spend or failures</span>
      </div>
      <Select value={alertType} onValueChange={onAlertTypeChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder="Alert type" />
        </SelectTrigger>
        <SelectContent>
          {ALERTS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

const RETRY_OPTIONS = [
  { value: "exponential", label: "Exponential backoff" },
  { value: "linear", label: "Linear backoff" },
  { value: "fixed", label: "Fixed delay" },
  { value: "none", label: "No backoff" },
];

const RETRY_MAX_OPTIONS = [
  { value: "3", label: "Max 3 retries" },
  { value: "5", label: "Max 5 retries" },
  { value: "10", label: "Max 10 retries" },
];

export function RetryNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [strategy, setStrategy] = useState((props.data?.retryStrategy as string) ?? "exponential");
  const [maxRetries, setMaxRetries] = useState((props.data?.maxRetries as string) ?? "5");
  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  const onStrategyChange = useCallback(
    (value: string) => {
      setStrategy(value);
      updateData("retryStrategy", value);
    },
    [updateData]
  );
  const onMaxRetriesChange = useCallback(
    (value: string) => {
      setMaxRetries(value);
      updateData("maxRetries", value);
    },
    [updateData]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Retry</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconRefresh className="size-4 shrink-0 text-[#888]" />
        <span>Auto-retry failed requests</span>
      </div>
      <Select value={strategy} onValueChange={onStrategyChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan mb-1.5">
          <SelectValue placeholder="Strategy" />
        </SelectTrigger>
        <SelectContent>
          {RETRY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={maxRetries} onValueChange={onMaxRetriesChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder="Max retries" />
        </SelectTrigger>
        <SelectContent>
          {RETRY_MAX_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

const CACHE_TTL_OPTIONS = [
  { value: "1", label: "1 minute" },
  { value: "5", label: "5 minutes" },
  { value: "60", label: "1 hour" },
  { value: "1440", label: "24 hours" },
];

export function CacheNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [ttl, setTtl] = useState((props.data?.cacheTtl as string) ?? "60");
  const onTtlChange = useCallback(
    (value: string) => {
      setTtl(value);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, cacheTtl: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Cache</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconDatabase className="size-4 shrink-0 text-[#888]" />
        <span>Response cache — reduce repeat API calls</span>
      </div>
      <Select value={ttl} onValueChange={onTtlChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder="TTL" />
        </SelectTrigger>
        <SelectContent>
          {CACHE_TTL_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

const VALIDATION_OPTIONS = [
  { value: "request", label: "Request only" },
  { value: "response", label: "Response only" },
  { value: "both", label: "Request & response" },
];

const VALIDATION_STRICT_OPTIONS = [
  { value: "strict", label: "Strict" },
  { value: "lenient", label: "Lenient" },
];

export function ValidationNode(props: NodeProps) {
  const { setNodes } = useReactFlow();
  const [scope, setScope] = useState((props.data?.validationScope as string) ?? "both");
  const [strict, setStrict] = useState((props.data?.validationStrict as string) ?? "strict");
  const updateData = useCallback(
    (field: string, value: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === props.id ? { ...n, data: { ...n.data, [field]: value } } : n
        )
      );
    },
    [props.id, setNodes]
  );
  const onScopeChange = useCallback(
    (value: string) => {
      setScope(value);
      updateData("validationScope", value);
    },
    [updateData]
  );
  const onStrictChange = useCallback(
    (value: string) => {
      setStrict(value);
      updateData("validationStrict", value);
    },
    [updateData]
  );
  return (
    <div className={NODE_STYLE}>
      <div className={LABEL_STYLE}>Validation</div>
      <div className="flex items-center gap-2 text-sm text-white mb-2">
        <IconShieldCheck className="size-4 shrink-0 text-[#888]" />
        <span>Schema & policy validation</span>
      </div>
      <Select value={scope} onValueChange={onScopeChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan mb-1.5">
          <SelectValue placeholder="Scope" />
        </SelectTrigger>
        <SelectContent>
          {VALIDATION_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={strict} onValueChange={onStrictChange}>
        <SelectTrigger className="h-8 w-full border-[#404040] bg-[#1a1a1a] text-white nodrag nopan">
          <SelectValue placeholder="Mode" />
        </SelectTrigger>
        <SelectContent>
          {VALIDATION_STRICT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Handle type="target" position={Position.Left} className={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} className={HANDLE_STYLE} />
    </div>
  );
}

export const connectionNodeTypes = {
  wallet: WalletNode,
  apiProvider: ApiProviderNode,
  proxyKey: ProxyKeyNode,
  rateLimit: RateLimitNode,
  alerts: AlertsNode,
  retry: RetryNode,
  cache: CacheNode,
  validation: ValidationNode,
};

export const NODE_BANK_ITEMS: {
  type: keyof typeof connectionNodeTypes;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "wallet", label: "Wallet", Icon: IconWallet },
  { type: "apiProvider", label: "API Provider", Icon: IconKey },
  { type: "proxyKey", label: "Proxy key", Icon: IconCertificate },
  { type: "rateLimit", label: "Rate limiting", Icon: IconGauge },
  { type: "alerts", label: "Alerts", Icon: IconBell },
  { type: "retry", label: "Retry", Icon: IconRefresh },
  { type: "cache", label: "Cache", Icon: IconDatabase },
  { type: "validation", label: "Validation", Icon: IconShieldCheck },
];
