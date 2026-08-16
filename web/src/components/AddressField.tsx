"use client";

import { useState } from "react";
import { SuggestInput } from "@/components/SuggestInput";
import { Suggestion } from "@/lib/api";

/**
 * Address field for the add-listing form. Picking a suggestion locks in its
 * coordinates, exposed to the enclosing form as hidden lat/lon fields;
 * editing the text again clears them.
 */
export function AddressField() {
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);

  return (
    <div>
      <SuggestInput
        name="address"
        autoFocus
        required
        value={value}
        onValueChange={(v) => {
          setValue(v);
          setPicked(null);
        }}
        onPick={(s) => {
          setValue(s.display_name);
          setPicked(s);
        }}
        placeholder="目黒区上目黒2-1-1"
      />
      {picked && (
        <>
          <input type="hidden" name="lat" value={picked.lat} />
          <input type="hidden" name="lon" value={picked.lon} />
        </>
      )}
    </div>
  );
}
