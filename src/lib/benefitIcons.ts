// Shared icon registry for rewards benefits.
// Used by both admin BenefitEditorModal and client BeneficiosTab so keys
// chosen in admin always render the right glyph in the client portal.
// NOTE: Sparkles is project-banned. Do not add it here.
import {
  Gift, Scissors, Star, Crown, Trophy, Award, Diamond, Heart,
  Flame, Zap, Tag, Percent, Ticket, ShoppingBag, Coffee, Wand2,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";

export const BENEFIT_ICONS: Record<string, LucideIcon> = {
  gift: Gift,
  scissors: Scissors,
  star: Star,
  crown: Crown,
  trophy: Trophy,
  award: Award,
  diamond: Diamond,
  heart: Heart,
  flame: Flame,
  zap: Zap,
  tag: Tag,
  percent: Percent,
  ticket: Ticket,
  bag: ShoppingBag,
  "shopping-bag": ShoppingBag,
  coffee: Coffee,
  wand: Wand2,
  user: UserIcon,
};

export const BENEFIT_ICON_KEYS = [
  "gift", "scissors", "star", "crown", "trophy", "award", "diamond", "heart",
  "flame", "zap", "tag", "percent", "ticket", "bag", "coffee", "wand",
];

export const resolveBenefitIcon = (key: string | null | undefined): LucideIcon =>
  (key && BENEFIT_ICONS[key]) || Gift;
