import {
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  Calculator,
  CloudSun,
  Droplets,
  FlaskConical,
  Grid3x3,
  LayoutDashboard,
  Lightbulb,
  ShieldCheck,
  Sprout,
  Tractor,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TKey } from '../i18n';

export interface NavItem {
  to: string;
  label: TKey;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: TKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.group.overview',
    items: [{ to: '/', label: 'nav.dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'nav.group.farm',
    items: [
      { to: '/farms', label: 'nav.farms', icon: Tractor },
      { to: '/crops', label: 'nav.crops', icon: Sprout },
      { to: '/hydroponics', label: 'nav.hydroponics', icon: FlaskConical },
    ],
  },
  {
    label: 'nav.group.water',
    items: [
      { to: '/water', label: 'nav.water', icon: Droplets, end: true },
      { to: '/water/calculations', label: 'nav.calculations', icon: Calculator },
      { to: '/irrigation', label: 'nav.irrigation', icon: Waves },
      { to: '/analytics', label: 'nav.analytics', icon: BarChart3 },
      { to: '/weather', label: 'nav.weather', icon: CloudSun },
    ],
  },
  {
    label: 'nav.group.intelligence',
    items: [
      { to: '/assistant', label: 'nav.assistant', icon: Bot },
      { to: '/recommendations', label: 'nav.recommendations', icon: Lightbulb },
      { to: '/alerts', label: 'nav.alerts', icon: Bell },
      { to: '/land', label: 'nav.land', icon: Grid3x3 },
      { to: '/knowledge-base', label: 'nav.kb', icon: BrainCircuit },
    ],
  },
  {
    label: 'nav.group.admin',
    items: [{ to: '/admin', label: 'nav.admin', icon: ShieldCheck, adminOnly: true }],
  },
];
