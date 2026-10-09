import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShippingPolicy } from "@/lib/shipping";

export function useShippingPolicy() {
  return useQuery({
    queryKey: ["shipping-policy"],
    queryFn: async (): Promise<ShippingPolicy> => {
      const { data, error } = await supabase.from("shipping_settings")
        .select("flat_rate, free_shipping_threshold").eq("id", true).single();
      if (error) throw error;
      if (!data || !Number.isFinite(data.flat_rate) || data.flat_rate < 0 ||
          !Number.isFinite(data.free_shipping_threshold) || data.free_shipping_threshold <= 0) {
        throw new Error("Shipping rates are unavailable.");
      }
      return data;
    },
    staleTime: 60_000,
  });
}
