import { useState, useEffect, useRef } from "react";
import { usePortfolio } from "../../hooks/usePortfolio";
import { useTradeWebSocket } from "../../hooks/useTrade";
import { API_BASE_URL } from "../../config";
import { toast } from "react-hot-toast"; // NEW: Added toast import (adjust if using react-toastify, sonner, etc.)

interface OrderFormProps {
  symbol: string;
  currentPrice: number; // The static fallback from TradePage
}

export function OrderForm({ symbol, currentPrice }: OrderFormProps) {
  const [tab, setTab] = useState<"order" | "pending">("order");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"limit" | "market" | "stop-limit">("limit");

  const { cashBalance } = usePortfolio();

  // NEW: State to hold the pending orders fetched from the Go backend
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);

  // NEW: Function to fetch active orders (GET request matching your Go handler)
  const fetchPendingOrders = async () => {
    const token = localStorage.getItem("access_token");

    if (!token) return;

    setIsFetchingOrders(true);
    try {

      const response = await fetch(`${API_BASE_URL}/orders/active`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();

      if (response.ok) {
        // Accessing data.orders based on your Go GeneralSuccess response structure
        const fetchedOrders = result.data?.orders || [];
        setPendingOrders(fetchedOrders);
      }
    } catch (err) {
      console.error(
        "[fetchPendingOrders]: Failed to fetch orders. Error:",
        err,
      );
    } finally {
      setIsFetchingOrders(false);
    }
  };

  // NEW: Function to handle order cancellation
  const handleCancelOrder = async (orderId: string) => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      toast.error("Authentication Error: No token found. Please log in again.");
      return;
    }

    // Optional: Add a confirmation prompt before cancelling
    // Commented out window.confirm to remove browser "localhost says" popups.
    // if (!window.confirm("Are you sure you want to cancel this order?")) {
    //   return;
    // }

    try {
      console.log(`[handleCancelOrder]: Cancelling order ${orderId}`);

      // Assuming your Go backend expects a DELETE request to /orders/{id}
      // Adjust the endpoint if your backend uses a different route (e.g., POST /orders/cancel)
      const response = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        // Try to parse error message from backend
        let errorMessage = `Failed to cancel order (HTTP ${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          // Ignore parsing error if response is not JSON
        }
        throw new Error(errorMessage);
      }

      console.log(
        `[handleCancelOrder]: Order ${orderId} cancelled successfully.`,
      );
      toast.success("Order cancelled successfully.");

      // Refresh the pending orders list to reflect the cancellation
      fetchPendingOrders();
    } catch (err: any) {
      console.error(" [handleCancelOrder]: Error:", err);
      toast.error(`Error cancelling order: ${err.message}`);
    }
  };

  // Fetch when tab changes to 'pending'
  useEffect(() => {
    if (tab === "pending") {
      fetchPendingOrders();
    }
  }, [tab]);

  // 2. CREATE A DYNAMIC STATE FOR THE LIVE MARKET PRICE
  const [liveMarketPrice, setLiveMarketPrice] = useState(currentPrice);

  const [price, setPrice] = useState(0); // Limit price
  const [amount, setAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // NEW: Add a ref to track if the price has been auto-filled for the current asset
  const hasAutoFilledPrice = useRef(false);
  const baseAsset = symbol ? symbol.split("/")[0] : "Asset";

  // 3. LISTEN TO THE LIVE TICKS (Just like the ChartPanel does!)
  useTradeWebSocket(symbol, "1s", (liveData: any) => {
    if (liveData && liveData.close) {
      setLiveMarketPrice(liveData.close);
    }
  });

  // Reset inputs when switching assets
  useEffect(() => {
    setPrice(0);
    setAmount(0);
    setLiveMarketPrice(currentPrice); // Reset to static fallback immediately on switch
    hasAutoFilledPrice.current = false; // NEW: Reset the autofill tracker on asset switch
  }, [symbol, currentPrice]);

  // Smart Limit Price: Auto-fill once, but don't overwrite if user types
  useEffect(() => {
    // NEW: Check the ref instead of price === 0
    if (!hasAutoFilledPrice.current && liveMarketPrice > 0) {
      setPrice(liveMarketPrice);
      hasAutoFilledPrice.current = true; // Mark as filled so it doesn't overwrite when user clears
    }
  }, [liveMarketPrice]);

  // 4. THE TOTAL USES THE LIVE TICKING PRICE
  const effectivePrice = type === "market" ? liveMarketPrice : price;
  const total = amount * effectivePrice;

  const handleAmountChange = (val: number) => {
    setAmount(Math.floor(val));
  };

  const handleSubmit = async () => {
    if (amount <= 0) return;
    if (type === "stop-limit") {
      setApiError("Stop-Limit orders are not supported yet.");
      return;
    }

    setIsLoading(true);
    setApiError(null);

    const payload = {
      id: `ORD-${Date.now()}`,
      symbol: symbol,
      type: type.toUpperCase(),
      side: side.toUpperCase(),
      price: effectivePrice,
      quantity: amount,
    };

    try {
      const token = localStorage.getItem("access_token");

      if (!token) {
        setApiError(
          "Authentication Error: No token found. Please log in again.",
        );
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let data: any = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(
            `Server error: Unexpected response format (Status ${response.status})`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            `Failed to place order (HTTP ${response.status})`,
        );
      }

      toast.success(
        `${side.toUpperCase()} Order Queued: ${data.data?.order_id || "Success"}`,
      );
      setAmount(0);
    } catch (err: any) {
      console.error("Order placement error:", err);
      setApiError(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="flex bg-panel flex-col h-full text-sm w-full font-sans">
      <div className="flex justify-start items-center px-3 py-2 border-b border-main shrink-0 z-10">
        <div className="flex bg-main p-1 rounded-lg border border-main shrink-0">
          <button
            onClick={() => setTab("order")}
            className={`text-[10px] uppercase font-bold px-3 py-1.5 rounded-md transition-colors ${tab === "order" ? "bg-panel shadow text-main" : "text-muted hover:text-main"}`}
          >
            Place Order
          </button>
          <button
            onClick={() => setTab("pending")}
            className={`text-[10px] uppercase font-bold px-3 py-1.5 rounded-md transition-colors ${tab === "pending" ? "bg-panel shadow text-main" : "text-muted hover:text-main"}`}
          >
            Pending Orders
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {tab === "order" ? (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex bg-panel/50 p-1 rounded-lg shrink-0">
              <button
                onClick={() => setSide("buy")}
                className={`flex-1 py-1 rounded-md text-center text-sm font-bold transition-all duration-200 ${side === "buy" ? "bg-up text-white shadow" : "text-muted hover:text-main"}`}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                className={`flex-1 py-1 rounded-md text-center text-sm font-bold transition-all duration-200 ${side === "sell" ? "bg-down text-white shadow" : "text-muted hover:text-main"}`}
              >
                Sell
              </button>
            </div>

            <div className="flex gap-4 border-b border-main uppercase tracking-wide text-[10px] pb-2 mb-3 shrink-0">
              {(["limit", "market", "stop-limit"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    if (apiError) setApiError(null);
                  }}
                  className={`font-semibold transition-colors uppercase tracking-widest ${type === t ? "text-main" : "text-muted hover:text-main"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 flex-1 min-h-0">
              {apiError && (
                <div className="bg-down/20 border border-down/50 text-down text-xs p-2 rounded shrink-0 font-medium">
                  {apiError}
                </div>
              )}

              <div className="flex flex-col gap-1.5 shrink-0">
                <label className="text-[10px] uppercase tracking-wide font-medium text-muted">
                  {type === "market" ? "Market Price" : "Price"}
                </label>
                <div className="flex bg-panel/50 border border-main/50 rounded-md overflow-hidden focus-within:border-white focus-within:ring-1 focus-within:ring-white/20 transition-all">
                  <input
                    type="number"
                    step="0.01"
                    // 5. STREAMS liveMarketPrice directly!
                    value={type === "market" ? liveMarketPrice : price || ""}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    disabled={type === "market"}
                    className="bg-transparent flex-1 p-2.5 outline-none text-main min-w-0 disabled:opacity-50 font-mono text-sm"
                  />
                  <span className="px-3 text-muted bg-panel/80 border-l border-main text-xs flex items-center font-medium">
                    INR
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                <label className="text-[10px] uppercase tracking-wide font-medium text-muted">
                  Quantity
                </label>
                <div className="flex bg-panel/50 border border-main/50 rounded-md overflow-hidden focus-within:border-white focus-within:ring-1 focus-within:ring-white/20 transition-all">
                  <input
                    type="number"
                    step="1"
                    value={amount || ""}
                    onChange={(e) => handleAmountChange(Number(e.target.value))}
                    placeholder="0"
                    className="bg-transparent flex-1 p-2.5 outline-none text-main min-w-0 font-mono text-sm"
                  />
                  <span className="px-3 text-muted bg-panel/80 border-l border-main text-xs flex items-center font-medium">
                    {baseAsset}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-xs text-muted shrink-0">
                <span>Available Balance</span>
                <span className="font-mono text-main">
                  ₹
                  {(cashBalance || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="mt-auto flex justify-between text-xs pt-2 border-t border-main mb-2 shrink-0">
                <span className="text-muted font-medium">Total</span>
                {/* 6. TOTAL TICKING IN REAL-TIME */}
                <span className="text-main font-bold font-mono">
                  {total > 0
                    ? `₹${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : "₹0.00"}
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={amount <= 0 || isLoading || type === "stop-limit"}
                className={`w-full py-2.5 rounded-lg font-bold text-white transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${side === "buy" ? "bg-up hover:brightness-110" : "bg-down hover:brightness-110"} shadow-lg shrink-0 text-sm flex items-center justify-center gap-2`}
              >
                {isLoading ? (
                  <span className="animate-pulse">Processing...</span>
                ) : (
                  <>
                    {side === "buy" ? "Buy" : "Sell"} {baseAsset}
                    {type !== "market" &&
                      price > 0 &&
                      ` @ ₹${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
              {/* NEW: Conditional rendering based on fetching state and data array */}
              {isFetchingOrders ? (
                <div className="text-center text-muted text-xs py-4 animate-pulse">
                  Loading...
                </div>
              ) : pendingOrders.length === 0 ? (
                <div className="text-center text-muted text-xs py-4">
                  No pending orders
                </div>
              ) : (
                /* NEW: Map through orders and utilize the exact fields from your Go struct */
                pendingOrders.map((ord) => {
                  return (
                    <div
                      key={ord.id}
                      className="bg-panel/40 border border-main/30 p-2 rounded flex flex-col gap-1"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-[10px] font-bold uppercase ${ord.side === "BUY" ? "text-up" : "text-down"}`}
                        >
                          {ord.side} {ord.symbol.split("/")[0]}
                        </span>
                        <span className="text-[10px] text-muted font-mono">
                          {ord.type}
                        </span>
                      </div>

                      <div className="flex justify-between text-xs mt-1">
                        {/* NEW: Show filled quantity out of total quantity */}
                        <span className="text-muted">
                          Qty:{" "}
                          <span className="text-main">
                            {ord.filled_quantity}
                          </span>{" "}
                          / {ord.quantity}
                        </span>
                        {/* NEW: Format price, handling market orders where price might be 0 */}
                        <span className="text-main font-mono">
                          {ord.type === "MARKET"
                            ? "Market"
                            : `₹${(ord.price || 0).toLocaleString()}`}
                        </span>
                      </div>

                      <div className="flex justify-between items-center mt-1 pt-1 border-t border-main/10">
                        {/* NEW: Fallback for 'Status' based on your struct's exact JSON tag `json:"Status"` */}
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-main/20 text-muted uppercase tracking-tighter">
                          {ord.Status || ord.status}
                        </span>

                        {/* NEW: Added Cancel button beside order status that triggers handleCancelOrder */}
                        <button
                          onClick={() => handleCancelOrder(ord.id)}
                          className="text-[9px] px-2 py-1 rounded bg-down/20 text-down hover:bg-down hover:text-white transition-colors uppercase font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}