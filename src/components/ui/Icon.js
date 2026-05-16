// Centralized Lucide icon registry. Lets us swap any emoji for a real SVG
// icon with consistent sizing/color, and keeps the icon vocabulary across
// the app aligned with shadcn/ui (which also uses Lucide on the web side).
//
// Usage:
//   <Icon name="camera" size={28} color={Colors.green} />
//
// Adding a new icon: import it from lucide-react-native and register it
// in the ICONS map below.
import React from 'react';
import {
  Camera, IdCard, ClipboardList, Receipt, Settings, Gift, MessageCircle,
  MapPin, Bell, ChevronRight, CheckCircle2, Circle, Triangle, Star, Heart,
  Square, ArrowLeft, ArrowRight, Plus, X, Check, Calendar, Clock, User,
  Users, Mail, Phone, Lock, LogOut, Eye, EyeOff, Search, Filter, Trash2,
  Edit3, Download, Upload, Image as ImageIcon, FileText, Leaf, TreePine,
  Droplet, Recycle, Sparkles, Award, TrendingUp, Building2, Store, Truck,
  Share2, Copy, ExternalLink, AlertCircle, Info, ShieldCheck,
} from 'lucide-react-native';
import { Colors } from '../../config/theme';

const ICONS = {
  camera: Camera,
  'id-card': IdCard,
  clipboard: ClipboardList,
  receipt: Receipt,
  settings: Settings,
  gift: Gift,
  message: MessageCircle,
  pin: MapPin,
  bell: Bell,
  chevron: ChevronRight,
  check: Check,
  'check-circle': CheckCircle2,
  circle: Circle,
  triangle: Triangle,
  star: Star,
  heart: Heart,
  square: Square,
  back: ArrowLeft,
  forward: ArrowRight,
  plus: Plus,
  close: X,
  calendar: Calendar,
  clock: Clock,
  user: User,
  users: Users,
  mail: Mail,
  phone: Phone,
  lock: Lock,
  logout: LogOut,
  eye: Eye,
  'eye-off': EyeOff,
  search: Search,
  filter: Filter,
  trash: Trash2,
  edit: Edit3,
  download: Download,
  upload: Upload,
  image: ImageIcon,
  file: FileText,
  leaf: Leaf,
  tree: TreePine,
  droplet: Droplet,
  recycle: Recycle,
  sparkles: Sparkles,
  award: Award,
  trending: TrendingUp,
  building: Building2,
  store: Store,
  truck: Truck,
  share: Share2,
  copy: Copy,
  external: ExternalLink,
  alert: AlertCircle,
  info: Info,
  shield: ShieldCheck,
};

export default function Icon({ name, size = 20, color = Colors.dark, strokeWidth = 2, style }) {
  const Cmp = ICONS[name];
  if (!Cmp) {
    if (__DEV__) console.warn(`Icon: unknown name "${name}"`);
    return null;
  }
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
