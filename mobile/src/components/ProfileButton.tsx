import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useSWR from 'swr';
import {
  Cable,
  ChevronRight,
  Dumbbell,
  Flame,
  LogOut,
  User,
  X,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { fetchServices, type Services } from '@/lib/services';
import { theme } from '@/lib/theme';
import { ProfileRow, ProfileSection, Toggle } from './ui';

type Units = 'metric' | 'imperial';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? '';

// The settings hub. Top-right circular button opens a full-screen profile
// page wired to Supabase — port of the web app's ProfileButton (core flows).
export function ProfileButton() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [units, setUnits] = useState<Units>('metric');
  const [stepGoal, setStepGoal] = useState(10000);
  const [squatRef, setSquatRef] = useState(140);
  const [benchRef, setBenchRef] = useState(100);
  const [deadliftRef, setDeadliftRef] = useState(180);

  const [macroKcal, setMacroKcal] = useState('');
  const [macroProtein, setMacroProtein] = useState('');
  const [macroCarbs, setMacroCarbs] = useState('');
  const [macroFat, setMacroFat] = useState('');

  const [editingName, setEditingName] = useState(false);
  const [editingMacros, setEditingMacros] = useState(false);
  const [hevyKey, setHevyKey] = useState('');
  const [showHevyInput, setShowHevyInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: services, mutate: mutateServices } = useSWR<Services>(
    open ? 'profile-services' : null,
    fetchServices,
    { revalidateOnFocus: false },
  );

  // Load account + settings whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      const user = data.user;
      const uid = user?.id ?? null;
      setUserId(uid);
      setEmail(user?.email ?? null);
      const meta = (user?.user_metadata ?? {}) as Record<string, string>;
      setFirstName((meta.first_name ?? '').trim() || (user?.email?.split('@')[0] ?? ''));
      setLastName((meta.last_name ?? '').trim());
      if (!uid) return;
      const { data: s } = await supabase
        .from('user_settings')
        .select(
          'units,step_goal,strength_squat_ref,strength_bench_ref,strength_deadlift_ref,macro_kcal,macro_protein,macro_carbs,macro_fat',
        )
        .eq('user_id', uid)
        .single();
      if (!active || !s) return;
      if (s.units) setUnits(s.units as Units);
      if (s.step_goal) setStepGoal(s.step_goal);
      if (s.strength_squat_ref) setSquatRef(s.strength_squat_ref);
      if (s.strength_bench_ref) setBenchRef(s.strength_bench_ref);
      if (s.strength_deadlift_ref) setDeadliftRef(s.strength_deadlift_ref);
      if (s.macro_kcal) setMacroKcal(String(s.macro_kcal));
      if (s.macro_protein) setMacroProtein(String(s.macro_protein));
      if (s.macro_carbs) setMacroCarbs(String(s.macro_carbs));
      if (s.macro_fat) setMacroFat(String(s.macro_fat));
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  };

  async function toggleUnits() {
    if (!userId) return;
    const next: Units = units === 'metric' ? 'imperial' : 'metric';
    setUnits(next);
    await supabase.from('user_settings').update({ units: next }).eq('user_id', userId);
  }

  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) {
      flash('Enter first and last name');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
      },
    });
    setBusy(false);
    if (error) flash(error.message);
    else {
      setEditingName(false);
      flash('Name saved');
    }
  }

  async function saveTargets() {
    if (!userId) return;
    setBusy(true);
    await supabase
      .from('user_settings')
      .update({
        step_goal: stepGoal,
        strength_squat_ref: squatRef,
        strength_bench_ref: benchRef,
        strength_deadlift_ref: deadliftRef,
      })
      .eq('user_id', userId);
    setBusy(false);
    flash('Targets saved');
  }

  async function saveMacros() {
    if (!userId) return;
    const kcal = Number(macroKcal);
    const protein = Number(macroProtein);
    const carbs = Number(macroCarbs);
    const fat = Number(macroFat);
    if (!kcal || !protein || !carbs || !fat) {
      flash('Fill in all macro fields');
      return;
    }
    setBusy(true);
    await supabase
      .from('user_settings')
      .update({ macro_kcal: kcal, macro_protein: protein, macro_carbs: carbs, macro_fat: fat })
      .eq('user_id', userId);
    setBusy(false);
    setEditingMacros(false);
    flash('Macros saved');
  }

  async function connectStrava() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-auth`);
      const { url } = await res.json();
      if (url) Linking.openURL(url);
    } catch {
      flash('Could not start Strava connect');
    }
  }

  function connectGoogleCalendar() {
    if (!userId) return;
    Linking.openURL(`${SUPABASE_URL}/functions/v1/google-calendar-auth?user_id=${userId}`);
  }

  function connectGoogleHealth() {
    if (!userId || !SITE_URL) {
      flash('Set EXPO_PUBLIC_SITE_URL to connect');
      return;
    }
    Linking.openURL(`${SITE_URL}/api/fitbit/connect?user_id=${userId}`);
  }

  async function saveHevyKey() {
    const key = hevyKey.trim();
    if (!key || !userId) return;
    setBusy(true);
    await supabase.from('api_keys').upsert(
      { service: 'hevy', api_key: key, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'service' },
    );
    const {
      data: { session },
    } = await supabase.auth.getSession();
    fetch(`${SUPABASE_URL}/functions/v1/hevy-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: '{}',
    }).catch(() => {});
    setBusy(false);
    setHevyKey('');
    setShowHevyInput(false);
    mutateServices((s) => (s ? { ...s, hevy: true } : s), { revalidate: true });
    flash('Hevy connected');
  }

  async function disconnect(which: 'strava' | 'google' | 'fitbit') {
    if (!userId) return;
    const table =
      which === 'strava' ? 'strava_tokens' : which === 'google' ? 'google_tokens' : 'fitbit_tokens';
    await supabase.from(table).delete().eq('user_id', userId);
    mutateServices((s) => (s ? { ...s, [which]: false } : s), { revalidate: false });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
  }

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || '—';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Profile"
        style={styles.trigger}
      >
        <User size={16} color="rgba(255,255,255,0.7)" />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} transparent={false}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          {/* Nav bar */}
          <View style={styles.navbar}>
            <View style={{ width: 64 }} />
            <Text style={styles.navTitle}>Profile</Text>
            <Pressable onPress={() => setOpen(false)} style={styles.doneBtn}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Account */}
            <ProfileSection title="Account">
              <ProfileRow separator onPress={() => setEditingName((v) => !v)}>
                <Text style={styles.label}>Name</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.value}>{fullName}</Text>
                  <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
                </View>
              </ProfileRow>
              {editingName && (
                <>
                  <ProfileRow separator>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="First name"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      style={styles.input}
                    />
                  </ProfileRow>
                  <ProfileRow separator>
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Last name"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      style={styles.input}
                    />
                  </ProfileRow>
                  <ProfileRow separator>
                    <Pressable onPress={saveName} disabled={busy} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>{busy ? '…' : 'Save name'}</Text>
                    </Pressable>
                  </ProfileRow>
                </>
              )}
              <ProfileRow>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{email ?? '—'}</Text>
              </ProfileRow>
            </ProfileSection>

            {/* Preferences */}
            <ProfileSection title="Preferences">
              <ProfileRow>
                <Text style={styles.label}>Units</Text>
                <View style={styles.valueRow}>
                  <Text style={styles.value}>{units === 'metric' ? 'Metric' : 'Imperial'}</Text>
                  <Toggle value={units === 'imperial'} onValueChange={toggleUnits} />
                </View>
              </ProfileRow>
            </ProfileSection>

            {/* Targets */}
            <ProfileSection title="Targets">
              <Stepper label="Step goal" value={stepGoal} step={1000} min={0} onChange={setStepGoal} separator />
              <Stepper label="Squat ref (kg)" value={squatRef} step={5} min={0} onChange={setSquatRef} separator />
              <Stepper label="Bench ref (kg)" value={benchRef} step={5} min={0} onChange={setBenchRef} separator />
              <Stepper label="Deadlift ref (kg)" value={deadliftRef} step={5} min={0} onChange={setDeadliftRef} separator />
              <ProfileRow>
                <Pressable onPress={saveTargets} disabled={busy} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>{busy ? '…' : 'Save targets'}</Text>
                </Pressable>
              </ProfileRow>
            </ProfileSection>

            {/* Macros */}
            <ProfileSection title="Nutrition targets">
              <ProfileRow separator onPress={() => setEditingMacros((v) => !v)}>
                <View style={styles.iconLabel}>
                  <Flame size={18} color={theme.orange} />
                  <Text style={styles.label}>Macros</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={styles.value}>{macroKcal ? `${macroKcal} kcal` : 'Set'}</Text>
                  <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
                </View>
              </ProfileRow>
              {editingMacros && (
                <>
                  <MacroInput label="Calories" value={macroKcal} onChange={setMacroKcal} separator />
                  <MacroInput label="Protein (g)" value={macroProtein} onChange={setMacroProtein} separator />
                  <MacroInput label="Carbs (g)" value={macroCarbs} onChange={setMacroCarbs} separator />
                  <MacroInput label="Fat (g)" value={macroFat} onChange={setMacroFat} separator />
                  <ProfileRow>
                    <Pressable onPress={saveMacros} disabled={busy} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>{busy ? '…' : 'Save macros'}</Text>
                    </Pressable>
                  </ProfileRow>
                </>
              )}
            </ProfileSection>

            {/* Devices & Apps */}
            <ProfileSection title="Devices & Apps">
              <DeviceRow
                icon={<Cable size={18} color={theme.teal} />}
                name="Strava"
                connected={!!services?.strava}
                onConnect={connectStrava}
                onDisconnect={() => disconnect('strava')}
                separator
              />
              <DeviceRow
                icon={<Dumbbell size={18} color={theme.teal} />}
                name="Hevy"
                connected={!!services?.hevy}
                onConnect={() => setShowHevyInput((v) => !v)}
                onDisconnect={undefined}
                separator
              />
              {showHevyInput && !services?.hevy && (
                <ProfileRow separator>
                  <View style={{ flex: 1, gap: 8 }}>
                    <TextInput
                      value={hevyKey}
                      onChangeText={setHevyKey}
                      placeholder="Hevy API key"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      autoCapitalize="none"
                      style={styles.input}
                    />
                    <Pressable onPress={saveHevyKey} disabled={busy} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>{busy ? '…' : 'Save key'}</Text>
                    </Pressable>
                  </View>
                </ProfileRow>
              )}
              <DeviceRow
                icon={<Cable size={18} color={theme.teal} />}
                name="Google Calendar"
                connected={!!services?.google}
                onConnect={connectGoogleCalendar}
                onDisconnect={() => disconnect('google')}
                separator
              />
              <DeviceRow
                icon={<Cable size={18} color={theme.teal} />}
                name="Google Health"
                connected={!!services?.fitbit}
                onConnect={connectGoogleHealth}
                onDisconnect={() => disconnect('fitbit')}
              />
            </ProfileSection>

            {/* Sign out */}
            <ProfileSection>
              <ProfileRow onPress={signOut}>
                <View style={styles.iconLabel}>
                  <LogOut size={18} color="#f87171" />
                  <Text style={[styles.label, { color: '#f87171' }]}>Sign out</Text>
                </View>
              </ProfileRow>
            </ProfileSection>

            <Text style={styles.footnote}>
              Advanced flows (multi-step macro calculator, training-zone editor) are summarized for now.
            </Text>
          </ScrollView>

          {msg && (
            <View style={[styles.toast, { bottom: insets.bottom + 24 }]} pointerEvents="none">
              <Text style={styles.toastText}>{msg}</Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function Stepper({
  label,
  value,
  step,
  min,
  onChange,
  separator,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (v: number) => void;
  separator?: boolean;
}) {
  return (
    <ProfileRow separator={separator}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable onPress={() => onChange(Math.max(min, value - step))} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>–</Text>
        </Pressable>
        <Text style={[styles.value, { minWidth: 56, textAlign: 'center' }]}>{value}</Text>
        <Pressable onPress={() => onChange(value + step)} style={styles.stepBtn}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </ProfileRow>
  );
}

function MacroInput({
  label,
  value,
  onChange,
  separator,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  separator?: boolean;
}) {
  return (
    <ProfileRow separator={separator}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor="rgba(255,255,255,0.25)"
        style={[styles.input, { textAlign: 'right', minWidth: 80 }]}
      />
    </ProfileRow>
  );
}

function DeviceRow({
  icon,
  name,
  connected,
  onConnect,
  onDisconnect,
  separator,
}: {
  icon: React.ReactNode;
  name: string;
  connected: boolean;
  onConnect: () => void;
  onDisconnect?: () => void;
  separator?: boolean;
}) {
  return (
    <ProfileRow separator={separator}>
      <View style={styles.iconLabel}>
        {icon}
        <Text style={styles.label}>{name}</Text>
      </View>
      {connected ? (
        <Pressable onPress={onDisconnect} disabled={!onDisconnect} style={styles.valueRow}>
          <Text style={[styles.value, { color: theme.teal }]}>Connected</Text>
          {onDisconnect && <X size={15} color="rgba(255,255,255,0.4)" />}
        </Pressable>
      ) : (
        <Pressable onPress={onConnect} style={styles.connectBtn}>
          <Text style={styles.connectText}>Connect</Text>
        </Pressable>
      )}
    </ProfileRow>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.profileBorder,
    backgroundColor: theme.profileBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: { flex: 1, backgroundColor: theme.bg },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  navTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  doneBtn: {
    width: 64,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#000', fontSize: 15, fontWeight: '600' },
  label: { color: 'rgba(255,255,255,0.85)', fontSize: 15 },
  value: { color: '#fff', fontSize: 16 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 2 },
  primaryBtn: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#fff', fontSize: 20, lineHeight: 22 },
  connectBtn: {
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  footnote: { color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', paddingHorizontal: 8 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(38,38,42,0.95)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.glassBorder,
  },
  toastText: { color: '#fff', fontSize: 14 },
});
