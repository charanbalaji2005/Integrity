import React from "react";
import { DEFAULT_PREFERENCES, type ThemeMode, usePreferences, resetPreferences } from "../preferences";
import { Button, Card, Row, SavedLocallyNote, SectionHeader, Segmented, ToggleRow } from "../ui";

export function AppearanceSection({ userId }: { userId: string }) {
  const { prefs, update } = usePreferences(userId);
  const a = prefs.appearance;
  const isDefault =
    a.theme === DEFAULT_PREFERENCES.appearance.theme &&
    a.textScale === DEFAULT_PREFERENCES.appearance.textScale &&
    a.reduceMotion === DEFAULT_PREFERENCES.appearance.reduceMotion;

  return (
    <div>
      <SectionHeader
        title="Appearance"
        description="How IntegrityOS looks on this device. The exam screen always uses its own fixed layout."
      />

      <Card
        title="Display"
        action={
          <Button variant="secondary" disabled={isDefault} onClick={() => resetPreferences(userId, "appearance")}>
            Reset
          </Button>
        }
      >
        <Row label="Theme" description="System follows your device's light or dark setting.">
          <Segmented<ThemeMode>
            label="Theme"
            value={a.theme}
            onChange={(theme) => update("appearance", { theme })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
          />
        </Row>
        <Row label="Interface size" description="Scales text and controls across the dashboard.">
          <Segmented<number>
            label="Interface size"
            value={a.textScale}
            onChange={(textScale) => update("appearance", { textScale })}
            options={[
              { value: 90, label: "Small" },
              { value: 100, label: "Default" },
              { value: 110, label: "Large" },
              { value: 125, label: "Larger" },
            ]}
          />
        </Row>
        <ToggleRow
          label="Reduce motion"
          description="Turns off animations and transitions."
          checked={a.reduceMotion}
          onChange={(reduceMotion) => update("appearance", { reduceMotion })}
        />
        <SavedLocallyNote />
      </Card>
    </div>
  );
}
