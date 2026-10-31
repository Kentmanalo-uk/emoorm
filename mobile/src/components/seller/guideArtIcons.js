import {
  ArrowCounterClockwiseIcon, BellIcon, BriefcaseIcon, CameraIcon, ChartLineUpIcon, ChatCircleDotsIcon,
  ClipboardTextIcon, ConfettiIcon, CookingPotIcon, GearSixIcon, HeadsetIcon, IdentificationCardIcon,
  ImageIcon, LightbulbIcon, MapPinIcon, MegaphoneIcon, NotePencilIcon, PackageIcon, PaintBrushIcon,
  QrCodeIcon, QuestionIcon, RocketLaunchIcon, SquaresFourIcon, StarIcon, StorefrontIcon, TruckIcon,
  UserCircleIcon, WalletIcon,
} from '../../lib/icons';

/*
 * The icon each SellerGuideArt scene floats on its glass, by the name the
 * scenes use (the website's). SellerGuideArt draws its filled shapes
 * (ikionShapes) so its own gradient can paint them.
 */
const GUIDE_ART_ICONS = {
  SquaresFour: SquaresFourIcon,
  Package: PackageIcon,
  Camera: CameraIcon,
  ClipboardText: ClipboardTextIcon,
  ArrowCounterClockwise: ArrowCounterClockwiseIcon,
  ChatCircleDots: ChatCircleDotsIcon,
  Lightbulb: LightbulbIcon,
  Megaphone: MegaphoneIcon,
  PaintBrush: PaintBrushIcon,
  UserCircle: UserCircleIcon,
  Storefront: StorefrontIcon,
  Truck: TruckIcon,
  ChartLineUp: ChartLineUpIcon,
  Wallet: WalletIcon,
  Star: StarIcon,
  Question: QuestionIcon,
  Bell: BellIcon,
  Headset: HeadsetIcon,
  GearSix: GearSixIcon,
  CookingPot: CookingPotIcon,
  IdentificationCard: IdentificationCardIcon,
  Briefcase: BriefcaseIcon,
  Image: ImageIcon,
  NotePencil: NotePencilIcon,
  MapPin: MapPinIcon,
  QrCode: QrCodeIcon,
  RocketLaunch: RocketLaunchIcon,
  Confetti: ConfettiIcon,
};

export default GUIDE_ART_ICONS;
