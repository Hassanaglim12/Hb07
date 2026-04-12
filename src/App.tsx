import React, { Component, useState, useEffect, FormEvent, Dispatch, SetStateAction, useRef, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LogIn, 
  LogOut, 
  Home, 
  Newspaper, 
  Music, 
  Users, 
  User as UserIcon,
  Settings,
  Bell,
  ChevronRight,
  Plus,
  Trash2,
  Mail,
  Edit3,
  Edit2,
  Save,
  ShieldCheck,
  Shield,
  Calendar,
  MapPin,
  Music2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Volume2,
  X,
  Terminal,
  Camera,
  Send,
  Upload,
  Image as ImageIcon,
  Heart,
  MessageCircle,
  Share2
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  Timestamp,
  addDoc,
  deleteDoc,
  updateDoc,
  where,
  getDocs,
  serverTimestamp,
  increment,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from './firebase';

// --- Types ---
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'admin' | 'moderator' | 'verified' | 'user';
  createdAt: string;
}

const ROLE_PERMISSIONS = {
  admin: {
    canManageNews: true,
    canManageChants: true,
    canManageMatches: true,
    canManageUsers: true,
    canManageFanZone: true,
  },
  moderator: {
    canManageNews: true,
    canManageChants: true,
    canManageMatches: true,
    canManageUsers: false,
    canManageFanZone: true,
  },
  verified: {
    canManageNews: false,
    canManageChants: false,
    canManageMatches: false,
    canManageUsers: false,
    canManageFanZone: false,
  },
  user: {
    canManageNews: false,
    canManageChants: false,
    canManageMatches: false,
    canManageUsers: false,
    canManageFanZone: false,
  },
};

interface NewsItem {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  createdAt: Timestamp;
  authorUid: string;
  likesCount?: number;
  commentsCount?: number;
}

interface ChantItem {
  id: string;
  title: string;
  lyrics: string;
  audioUrl?: string;
  createdAt: Timestamp;
}

interface MatchItem {
  id: string;
  opponent: string;
  date: string;
  venue: string;
  isNext: boolean;
  createdAt: Timestamp;
}

interface FanZonePost {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  userRole?: 'admin' | 'user';
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  status: 'pending' | 'approved' | 'rejected';
  likesCount?: number;
  commentsCount?: number;
  createdAt: Timestamp;
}

interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: Timestamp;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: Timestamp;
  link?: string;
}

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

const createNotification = async (userId: string, notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => {
  try {
    await addDoc(collection(db, 'users', userId, 'notifications'), {
      ...notification,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState;
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="glass p-8 rounded-[2.5rem] flex flex-col items-center max-w-sm w-full shadow-ultra">
          <div className="bg-red-900/20 p-6 rounded-full mb-6 shadow-glow">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-display font-black text-white mb-2 text-glow">Application Error</h2>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="ultra-gradient hover:scale-105 active:scale-95 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-glow"
          >
            Reload Application
          </button>
        </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Components ---

const PersistentPlayer = ({ 
  currentChant, 
  isPlaying, 
  onToggle, 
  onClose 
}: { 
  currentChant: ChantItem | null, 
  isPlaying: boolean, 
  onToggle: () => void,
  onClose: () => void
}) => {
  if (!currentChant) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-24 left-4 right-4 z-40"
    >
      <div className="glass rounded-[2rem] p-4 shadow-glow flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl ultra-gradient flex items-center justify-center shrink-0 shadow-lg shadow-green-600/20">
          <Music className={`h-6 w-6 text-white ${isPlaying ? 'animate-pulse' : ''}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-display font-bold text-white truncate">{currentChant.title}</h4>
          <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest text-glow">Now Playing</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={onToggle}
            className="h-10 w-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
          </button>
          <button 
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden"
    >
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-green-600/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-green-600/10 blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="relative mb-8"
      >
        <div className="h-32 w-32 rounded-[2.5rem] ultra-gradient p-1 shadow-glow relative z-10">
          <div className="h-full w-full rounded-[2.2rem] bg-black flex items-center justify-center">
            <ShieldCheck className="h-16 w-16 text-green-500" />
          </div>
        </div>
        <motion.div 
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="absolute -inset-6 rounded-full bg-green-500/20 blur-2xl"
        />
      </motion.div>
      
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center"
      >
        <h1 className="text-5xl font-display font-black tracking-tighter text-green-500 text-glow uppercase">
          HELALA BOYS
        </h1>
        <p className="mt-3 text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">
          KAC KENITRA • ULTRAS
        </p>
      </motion.div>
      
      <div className="absolute bottom-20 w-64 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ x: "-100%" }}
          animate={{ x: "0%" }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          className="h-full ultra-gradient shadow-glow"
        />
      </div>
    </motion.div>
  );
};

const AuthScreen = () => {
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        const adminEmails = ["hassanaglim12@gmail.com", "hassansmk12@gmail.com"];
        const isAdmin = user.email && adminEmails.includes(user.email);
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          displayName: user.displayName || 'Fan',
          email: user.email || '',
          photoURL: user.photoURL || '',
          role: isAdmin ? 'admin' : 'user',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Auth error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8 text-white relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-15%] left-[-15%] w-[70%] h-[70%] bg-green-600/10 blur-[180px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-15%] right-[-15%] w-[70%] h-[70%] bg-green-600/10 blur-[180px] rounded-full animate-pulse" style={{ animationDelay: '1.5s' }} />

      <div className="mb-16 text-center relative z-10">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-8 inline-block p-4 rounded-[2rem] glass-card border-green-500/20"
        >
          <ShieldCheck className="h-12 w-12 text-green-500" />
        </motion.div>
        <h2 className="text-6xl font-display font-black tracking-tighter text-green-500 text-glow uppercase leading-none">JOIN THE<br/>FAMILY</h2>
        <p className="mt-6 text-gray-400 font-medium tracking-tight max-w-[240px] mx-auto">Access exclusive content, news, and the fan zone.</p>
      </div>
      
      <button
        onClick={handleSignIn}
        disabled={loading}
        className="group relative flex w-full max-w-xs items-center justify-center gap-4 rounded-[2rem] ultra-gradient px-8 py-6 text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-glow"
      >
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogIn className="h-6 w-6" />}
        <span className="font-black uppercase tracking-widest text-sm">{loading ? 'Connecting...' : 'Sign in with Google'}</span>
      </button>
      
      <p className="absolute bottom-12 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
        EST. 2006 • KENITRA
      </p>
    </div>
  );
};

const Navbar = ({ activeTab, setActiveTab, isAdmin }: { activeTab: string, setActiveTab: (tab: string) => void, isAdmin: boolean }) => {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'news', icon: Newspaper, label: 'News' },
    { id: 'chants', icon: Music, label: 'Chants' },
    { id: 'community', icon: Camera, label: 'Fan Zone' },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', icon: ShieldCheck, label: 'Admin' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t-0 rounded-t-[3rem] shadow-ultra px-4 pb-8 pt-4">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex flex-col items-center gap-2 transition-all duration-500 group ${
              activeTab === tab.id ? 'text-green-500' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <div className={`p-3 rounded-2xl transition-all duration-500 ${
              activeTab === tab.id ? 'bg-green-500/10 shadow-glow scale-110' : 'group-hover:bg-white/5'
            }`}>
              <tab.icon className={`h-6 w-6 ${activeTab === tab.id ? 'text-green-500' : ''}`} />
            </div>
            <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === tab.id ? 'text-glow opacity-100' : 'opacity-40'}`}>
              {tab.label}
            </span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="nav-glow"
                className="absolute -bottom-2 h-1 w-8 ultra-gradient rounded-full shadow-glow"
              />
            )}
          </button>
        ))}
      </div>
    </nav>
  );
};

const Header = ({ 
  user, 
  userProfile, 
  onNavigate,
  unreadNotificationsCount,
  onOpenNotifications
}: { 
  user: FirebaseUser, 
  userProfile: UserProfile | null, 
  onNavigate: (tab: string) => void,
  unreadNotificationsCount: number,
  onOpenNotifications: () => void
}) => {
  const photoURL = userProfile?.photoURL || user.photoURL;
  const displayName = userProfile?.displayName || user.displayName || 'Fan';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between glass border-x-0 border-t-0 px-8 py-6 shadow-ultra rounded-b-[2.5rem]">
      <div className="flex items-center gap-4 cursor-pointer group" onClick={() => onNavigate('profile')}>
        <div className="relative">
          <div className="h-12 w-12 overflow-hidden rounded-2xl border-2 border-white/10 bg-white/5 shadow-glow group-hover:border-green-500/50 transition-all">
            {photoURL ? (
              <img src={photoURL} alt="Profile" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-green-500">
                <Users className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-black bg-green-500 shadow-glow" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">Welcome,</p>
            {userProfile?.role && userProfile.role !== 'user' && (
              <span className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${
                userProfile.role === 'admin' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                userProfile.role === 'moderator' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                'bg-blue-500/10 text-blue-500 border-blue-500/20'
              }`}>
                {userProfile.role === 'admin' ? 'Admin' : 
                 userProfile.role === 'moderator' ? 'Moderator' : 'Verified'}
              </span>
            )}
          </div>
          <p className="text-sm font-display font-black text-white leading-none tracking-tight uppercase group-hover:text-green-500 transition-colors">{displayName.split(' ')[0]}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <button 
          onClick={onOpenNotifications}
          className="relative p-3 rounded-xl glass hover:bg-white/10 transition-all group"
        >
          <Bell className="h-5 w-5 text-gray-400 group-hover:text-green-500 transition-colors" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full ultra-gradient text-[8px] font-black text-white shadow-glow border border-black">
              {unreadNotificationsCount}
            </span>
          )}
        </button>
        <button onClick={() => signOut(auth)} className="p-3 rounded-xl glass hover:bg-red-500/10 transition-all group">
          <LogOut className="h-5 w-5 text-gray-400 group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </header>
  );
};

const NewsScreen = ({ user, addToast }: { user: FirebaseUser | null, addToast: (msg: string, type: 'success' | 'error') => void }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [likedNews, setLikedNews] = useState<Set<string>>(new Set());
  const [activeCommentsNews, setActiveCommentsNews] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      setNews(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'news');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || news.length === 0) return;
    
    const checkLikes = async () => {
      const liked = new Set<string>();
      for (const item of news) {
        const likeDoc = await getDoc(doc(db, 'news', item.id, 'likes', user.uid));
        if (likeDoc.exists()) {
          liked.add(item.id);
        }
      }
      setLikedNews(liked);
    };
    
    checkLikes();
  }, [user, news.length]);

  const handleLike = async (newsId: string) => {
    if (!user) {
      addToast("Please login to like news", "error");
      return;
    }
    const isLiked = likedNews.has(newsId);
    const likeRef = doc(db, 'news', newsId, 'likes', user.uid);
    const newsRef = doc(db, 'news', newsId);

    try {
      if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(newsRef, { likesCount: increment(-1) });
        setLikedNews(prev => {
          const next = new Set(prev);
          next.delete(newsId);
          return next;
        });
      } else {
        await setDoc(likeRef, {
          newsId,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(newsRef, { likesCount: increment(1) });
        
        const item = news.find(n => n.id === newsId);
        if (item && item.authorUid !== user.uid) {
          await createNotification(item.authorUid, {
            title: "New Like",
            message: `${user.displayName || 'Someone'} liked your news article: "${item.title}"`,
            type: 'info',
            link: 'activeTab:news'
          });
        }

        setLikedNews(prev => new Set(prev).add(newsId));
      }
    } catch (error) {
      addToast("Failed to update like", "error");
    }
  };

  const handleShare = async (item: NewsItem) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          text: item.content.substring(0, 100) + '...',
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      addToast("Sharing not supported on this browser", "error");
    }
  };

  if (loading) return <div className="flex justify-center p-12"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="h-8 w-8 border-2 border-green-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="px-6 pb-32 pt-8">
      <h2 className="text-3xl font-display font-black text-green-500 mb-8 text-glow tracking-tight uppercase">Latest News</h2>
      <div className="space-y-8">
        {news.length > 0 ? news.map((item) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            key={item.id} 
            className="glass-card overflow-hidden rounded-[2.5rem] group"
          >
            <div className="relative overflow-hidden h-56 cursor-pointer" onClick={() => setSelectedNews(item)}>
              <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            </div>
            <div className="p-8">
              <h3 className="text-2xl font-display font-bold text-white leading-tight group-hover:text-green-400 transition-colors cursor-pointer" onClick={() => setSelectedNews(item)}>{item.title}</h3>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed line-clamp-3">{item.content}</p>
              
              <div className="mt-6 flex items-center gap-6">
                <button 
                  onClick={() => handleLike(item.id)}
                  className={`flex items-center gap-2 transition-all ${likedNews.has(item.id) ? 'text-red-500' : 'text-gray-400 hover:text-white'}`}
                >
                  <Heart className={`h-5 w-5 ${likedNews.has(item.id) ? 'fill-current' : ''}`} />
                  <span className="text-xs font-black">{item.likesCount || 0}</span>
                </button>
                <button 
                  onClick={() => setActiveCommentsNews(item.id)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
                >
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-xs font-black">{item.commentsCount || 0}</span>
                </button>
                <button 
                  onClick={() => handleShare(item)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
                >
                  <Share2 className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSelectedNews(item)}
                  className="ml-auto text-green-500 text-xs font-black uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
                >
                  Read More <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-900 p-6 text-gray-600">
              <Newspaper className="h-12 w-12" />
            </div>
            <p className="text-gray-500">No news articles yet.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedNews && (
          <NewsDetailModal item={selectedNews} onClose={() => setSelectedNews(null)} />
        )}
        {activeCommentsNews && user && (
          <CommentsModal 
            postId={activeCommentsNews}
            collectionName="news"
            authorId={news.find(n => n.id === activeCommentsNews)?.authorUid}
            itemTitle={news.find(n => n.id === activeCommentsNews)?.title}
            user={user}
            addToast={addToast}
            onClose={() => setActiveCommentsNews(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) => {
  return (
    <div className="fixed top-6 left-1/2 z-[100] w-full max-w-xs -translate-x-1/2 space-y-3 px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`flex items-center gap-3 rounded-2xl p-4 shadow-2xl backdrop-blur-xl ${
              toast.type === 'success' ? 'bg-green-600/90 text-white' : 'bg-red-600/90 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
            <p className="text-sm font-bold">{toast.message}</p>
            <button onClick={() => removeToast(toast.id)} className="ml-auto opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const ChantsScreen = ({ 
  currentChant, 
  isPlaying, 
  onPlay 
}: { 
  currentChant: ChantItem | null, 
  isPlaying: boolean, 
  onPlay: (chant: ChantItem) => void 
}) => {
  const [chants, setChants] = useState<ChantItem[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'chants'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChantItem));
      setChants(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chants');
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="px-6 pb-32 pt-8">
      <h2 className="text-3xl font-display font-black text-green-500 mb-8 text-glow tracking-tight uppercase">Ultras Chants</h2>
      <div className="space-y-4">
        {chants.length > 0 ? chants.map((chant) => (
          <div key={chant.id} className="glass-card rounded-[2rem] p-6 flex items-center justify-between group">
            <div className="flex-1 mr-4">
              <h3 className="font-display font-bold text-white text-xl leading-tight group-hover:text-green-400 transition-colors">{chant.title}</h3>
              <p className="text-[11px] text-gray-500 mt-2 line-clamp-1 italic font-medium">"{chant.lyrics}"</p>
            </div>
            {chant.audioUrl && (
              <button 
                onClick={() => onPlay(chant)}
                className={`h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-glow transition-all active:scale-90 ${
                  currentChant?.id === chant.id && isPlaying ? 'bg-white text-green-600' : 'ultra-gradient hover:scale-105'
                }`}
              >
                {currentChant?.id === chant.id && isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" />
                ) : (
                  <Play className="h-6 w-6 fill-current ml-1" />
                )}
              </button>
            )}
          </div>
        )) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-900 p-6 text-gray-600">
              <Music2 className="h-12 w-12" />
            </div>
            <p className="text-gray-500">No chants available yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const NewsDetailModal = ({ 
  item, 
  onClose 
}: { 
  item: NewsItem, 
  onClose: () => void 
}) => {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        className="w-full max-w-2xl glass rounded-[3rem] overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="relative h-64 sm:h-80 shrink-0">
          <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
          <button onClick={onClose} className="absolute top-6 right-6 p-3 rounded-2xl bg-black/50 text-white hover:bg-black/80 transition-all backdrop-blur-md">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="p-8 sm:p-12 overflow-y-auto scrollbar-hide">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-green-500 mb-4 block">
            {item.createdAt?.toDate().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-black text-white leading-tight mb-8 tracking-tight">{item.title}</h2>
          <div className="prose prose-invert max-w-none">
            <p className="text-gray-300 leading-relaxed text-lg whitespace-pre-wrap">{item.content}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const CommentsModal = ({ 
  postId, 
  collectionName,
  authorId,
  itemTitle,
  onClose, 
  user, 
  addToast 
}: { 
  postId: string, 
  collectionName: string,
  authorId?: string,
  itemTitle?: string,
  onClose: () => void, 
  user: FirebaseUser, 
  addToast: (msg: string, type: 'success' | 'error') => void 
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, collectionName, postId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${collectionName}/${postId}/comments`);
    });
    return () => unsubscribe();
  }, [postId, collectionName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || loading) return;

    setLoading(true);
    try {
      const commentData = {
        postId,
        userId: user.uid,
        userName: user.displayName || 'Fan',
        userPhoto: user.photoURL || '',
        text: newComment.trim(),
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, collectionName, postId, 'comments'), commentData);
      await updateDoc(doc(db, collectionName, postId), {
        commentsCount: increment(1)
      });

      if (authorId && authorId !== user.uid) {
        await createNotification(authorId, {
          title: "New Comment",
          message: `${user.displayName || 'Someone'} commented on your ${collectionName === 'news' ? 'news article' : 'post'}${itemTitle ? `: "${itemTitle}"` : ''}`,
          type: 'info',
          link: `activeTab:${collectionName === 'news' ? 'news' : 'community'}`
        });
      }

      setNewComment('');
    } catch (error: any) {
      addToast("Failed to add comment", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/90 backdrop-blur-sm">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full max-w-md glass rounded-t-[3rem] sm:rounded-[3rem] p-8 h-[80vh] sm:h-[600px] flex flex-col"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">Comments</h3>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
          {comments.length > 0 ? comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <img src={comment.userPhoto} alt={comment.userName} className="h-8 w-8 rounded-xl border border-white/10 flex-shrink-0" referrerPolicy="no-referrer" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-display font-bold text-white">{comment.userName}</span>
                  <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">
                    {comment.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{comment.text}</p>
              </div>
            </div>
          )) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <MessageCircle className="h-12 w-12 text-gray-800 mb-4" />
              <p className="text-gray-600 text-sm font-medium">No comments yet. Be the first!</p>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 pt-6 border-t border-white/5">
          <div className="relative">
            <input 
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 pr-14 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
            />
            <button 
              type="submit"
              disabled={!newComment.trim() || loading}
              className="absolute right-2 top-2 bottom-2 aspect-square ultra-gradient rounded-xl flex items-center justify-center text-white disabled:opacity-50 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const NotificationsModal = ({ 
  notifications, 
  onClose, 
  onMarkAsRead,
  onClearAll,
  onNavigate
}: { 
  notifications: Notification[], 
  onClose: () => void,
  onMarkAsRead: (id: string) => void,
  onClearAll: () => void,
  onNavigate: (link: string) => void
}) => {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/90 backdrop-blur-sm">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full max-w-md glass rounded-t-[3rem] sm:rounded-[3rem] p-8 h-[80vh] sm:h-[600px] flex flex-col"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">Notifications</h3>
          <div className="flex items-center gap-4">
            {notifications.length > 0 && (
              <button 
                onClick={onClearAll}
                className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
              >
                Clear All
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
          {notifications.length > 0 ? notifications.map((notif) => (
            <motion.div 
              key={notif.id} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => {
                if (!notif.read) onMarkAsRead(notif.id);
                if (notif.link) onNavigate(notif.link);
              }}
              className={`p-5 rounded-[2rem] border transition-all cursor-pointer ${
                notif.read ? 'bg-white/5 border-white/5 opacity-60' : 'bg-green-500/5 border-green-500/20 shadow-glow'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl shrink-0 ${
                  notif.type === 'success' ? 'bg-green-500/10 text-green-500' :
                  notif.type === 'warning' ? 'bg-yellow-500/10 text-yellow-500' :
                  notif.type === 'error' ? 'bg-red-500/10 text-red-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  {notif.type === 'success' ? <CheckCircle2 size={18} /> :
                   notif.type === 'warning' ? <AlertCircle size={18} /> :
                   notif.type === 'error' ? <AlertCircle size={18} /> :
                   <Bell size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className={`text-sm font-display font-bold truncate ${notif.read ? 'text-gray-400' : 'text-white'}`}>
                      {notif.title}
                    </h4>
                    <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest ml-2">
                      {notif.createdAt?.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${notif.read ? 'text-gray-500' : 'text-gray-300'}`}>
                    {notif.message}
                  </p>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <div className="p-6 rounded-full bg-gray-900 mb-4 text-gray-700">
                <Bell className="h-12 w-12" />
              </div>
              <p className="text-gray-600 text-sm font-medium">No notifications yet.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const VideoPlayerModal = ({ videoUrl, onClose }: { videoUrl: string, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 sm:p-10">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="relative w-full max-w-5xl aspect-video rounded-[2rem] overflow-hidden shadow-ultra border border-white/10"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-white hover:text-black transition-all backdrop-blur-md"
        >
          <X className="h-6 w-6" />
        </button>
        <video 
          src={videoUrl} 
          controls 
          autoPlay 
          className="h-full w-full object-contain"
        />
      </motion.div>
    </div>
  );
};

const CommunityScreen = ({ user, userProfile, addToast, handleUpload, compressImage, uploadProgress }: { 
  user: FirebaseUser, 
  userProfile: UserProfile | null,
  addToast: (msg: string, type: 'success' | 'error') => void,
  handleUpload: (file: Blob | File, path: string, onTaskCreated?: (task: any) => void) => Promise<string>,
  compressImage: (file: File) => Promise<Blob | File>,
  uploadProgress: number
}) => {
  const [posts, setPosts] = useState<FanZonePost[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [activeCommentsPost, setActiveCommentsPost] = useState<string | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const uploadTaskRef = useRef<any>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'fanzone'), 
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FanZonePost));
      setPosts(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'fanzone');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || posts.length === 0) return;
    
    const checkLikes = async () => {
      const liked = new Set<string>();
      // Only check likes for the posts currently in view to avoid massive queries
      const postIds = posts.map(p => p.id);
      for (const postId of postIds) {
        const likeDoc = await getDoc(doc(db, 'fanzone', postId, 'likes', user.uid));
        if (likeDoc.exists()) {
          liked.add(postId);
        }
      }
      setLikedPosts(liked);
    };
    
    checkLikes();
  }, [user, posts.length]); // Only re-check if post count changes or user changes

  const handleLike = async (postId: string) => {
    if (!user) return;
    const isLiked = likedPosts.has(postId);
    const likeRef = doc(db, 'fanzone', postId, 'likes', user.uid);
    const postRef = doc(db, 'fanzone', postId);

    try {
      if (isLiked) {
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likesCount: increment(-1) });
        setLikedPosts(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      } else {
        await setDoc(likeRef, {
          postId,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(postRef, { likesCount: increment(1) });

        const post = posts.find(p => p.id === postId);
        if (post && post.userId !== user.uid) {
          await createNotification(post.userId, {
            title: "New Like",
            message: `${user.displayName || 'Someone'} liked your post${post.caption ? `: "${post.caption}"` : ''}`,
            type: 'info',
            link: 'activeTab:community'
          });
        }

        setLikedPosts(prev => new Set(prev).add(postId));
      }
    } catch (error) {
      addToast("Failed to update like", "error");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaFile || !user) return;

    setIsUploading(true);
    try {
      let finalFile: Blob | File = mediaFile;
      if (mediaFile.type.startsWith('image/')) {
        finalFile = await compressImage(mediaFile);
      }

      const mediaUrl = await handleUpload(finalFile, 'fanzone', (task) => {
        uploadTaskRef.current = task;
      });
      const mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';

      await addDoc(collection(db, 'fanzone'), {
        userId: user.uid,
        userName: userProfile?.displayName || user.displayName || 'Anonymous Fan',
        userPhoto: userProfile?.photoURL || user.photoURL || '',
        userRole: userProfile?.role || 'user',
        mediaUrl,
        mediaType,
        caption,
        status: 'pending',
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp()
      });

      await createNotification(user.uid, {
        title: "Post Submitted",
        message: "Your post has been submitted for approval. We'll notify you once it's reviewed!",
        type: 'info',
        link: 'activeTab:profile'
      });

      addToast("Post submitted for approval!", "success");
      setShowUploadModal(false);
      setCaption('');
      setMediaFile(null);
      setPreviewUrl(null);
    } catch (error: any) {
      addToast(error.message || "Failed to post", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleShare = async (post: FanZonePost) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Helala Boys Fan Zone',
          text: post.caption,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      addToast("Sharing not supported on this browser", "error");
    }
  };

  return (
    <div className="px-6 pb-32 pt-8">
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-4xl font-display font-black text-green-500 text-glow tracking-tight uppercase">Fan Zone</h2>
        <button 
          onClick={() => setShowUploadModal(true)}
          className="ultra-gradient hover:scale-110 active:scale-90 text-white p-4 rounded-2xl shadow-glow transition-all"
        >
          <Camera className="h-6 w-6" />
        </button>
      </div>

      <div className="space-y-10">
        {posts.length > 0 ? posts.map((post) => (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            key={post.id} 
            className="glass-card overflow-hidden rounded-[2.5rem]"
          >
            <div className="p-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl border-2 border-green-500/30 overflow-hidden shadow-glow">
                <img src={post.userPhoto} alt={post.userName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-display font-bold text-white block leading-none">{post.userName}</span>
                  {post.userRole && (
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                      post.userRole === 'admin' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                      post.userRole === 'moderator' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                      post.userRole === 'verified' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      'bg-gray-500/10 text-gray-500 border-white/10'
                    }`}>
                      {post.userRole === 'admin' ? 'Admin' : 
                       post.userRole === 'moderator' ? 'Moderator' : 
                       post.userRole === 'verified' ? 'Verified Fan' : 'Fan'}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-gray-500 mt-1 block">
                  {post.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
            
            <div 
              className="aspect-square w-full bg-black/40 relative overflow-hidden cursor-pointer group"
              onClick={() => post.mediaType === 'video' && setActiveVideoUrl(post.mediaUrl)}
            >
              {post.mediaType === 'video' ? (
                <>
                  <video src={post.mediaUrl} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                    <div className="p-5 rounded-full bg-green-500/80 text-white shadow-glow scale-90 group-hover:scale-100 transition-transform">
                      <Play className="h-8 w-8 fill-current" />
                    </div>
                  </div>
                </>
              ) : (
                <img src={post.mediaUrl} alt="Fan Post" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" referrerPolicy="no-referrer" />
              )}
            </div>

            <div className="p-6">
              <div className="flex items-center gap-6 mb-4">
                <button 
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-2 transition-all ${likedPosts.has(post.id) ? 'text-red-500' : 'text-gray-400 hover:text-white'}`}
                >
                  <Heart className={`h-6 w-6 ${likedPosts.has(post.id) ? 'fill-current' : ''}`} />
                  <span className="text-xs font-black">{post.likesCount || 0}</span>
                </button>
                <button 
                  onClick={() => setActiveCommentsPost(post.id)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
                >
                  <MessageCircle className="h-6 w-6" />
                  <span className="text-xs font-black">{post.commentsCount || 0}</span>
                </button>
                <button 
                  onClick={() => handleShare(post)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-all"
                >
                  <Share2 className="h-6 w-6" />
                </button>
              </div>

              {post.caption && (
                <p className="text-sm text-gray-300 leading-relaxed">
                  <span className="font-display font-bold text-white mr-2">{post.userName}</span>
                  {post.caption}
                </p>
              )}
            </div>
          </motion.div>
        )) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-gray-900 p-6 text-gray-600">
              <Camera className="h-12 w-12" />
            </div>
            <p className="text-gray-500">No fan posts yet. Be the first!</p>
          </div>
        )}
      </div>

      {/* Comments Modal */}
      <AnimatePresence>
        {activeCommentsPost && (
          <CommentsModal 
            postId={activeCommentsPost}
            collectionName="fanzone"
            authorId={posts.find(p => p.id === activeCommentsPost)?.userId}
            itemTitle={posts.find(p => p.id === activeCommentsPost)?.caption}
            user={user}
            addToast={addToast}
            onClose={() => setActiveCommentsPost(null)}
          />
        )}
      </AnimatePresence>

      {/* Video Player Modal */}
      <AnimatePresence>
        {activeVideoUrl && (
          <VideoPlayerModal 
            videoUrl={activeVideoUrl} 
            onClose={() => setActiveVideoUrl(null)} 
          />
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className="w-full max-w-sm glass rounded-[3rem] p-8 shadow-ultra"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-display font-black text-white text-glow tracking-tight">POST TO FAN ZONE</h3>
                <button onClick={() => setShowUploadModal(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {!navigator.onLine && (
                <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-red-500">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-widest">No Internet Connection</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div 
                  onClick={() => document.getElementById('fan-media')?.click()}
                  className="aspect-square w-full rounded-[2rem] border-2 border-dashed border-white/10 glass-card flex flex-col items-center justify-center cursor-pointer overflow-hidden relative group"
                >
                  {previewUrl ? (
                    mediaFile?.type.startsWith('video/') ? (
                      <video src={previewUrl} className="h-full w-full object-cover" />
                    ) : (
                      <img src={previewUrl} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-green-500/10 text-green-500 group-hover:bg-green-500 group-hover:text-white transition-all duration-500">
                        <Upload className="h-8 w-8" />
                      </div>
                      <p className="mt-4 text-xs font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-300">Select Media</p>
                    </>
                  )}
                  <input 
                    id="fan-media" 
                    type="file" 
                    accept="image/*,video/*" 
                    onChange={handleFileChange} 
                    className="hidden" 
                    required 
                  />
                </div>

                <textarea
                  placeholder="What's happening in the stadium?"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full rounded-2xl bg-white/5 border border-white/10 p-5 text-sm text-white placeholder-gray-600 focus:border-green-500 focus:outline-none transition-all h-28 resize-none font-medium"
                />

                <button
                  type="submit"
                  disabled={isUploading || !mediaFile}
                  className="w-full ultra-gradient hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest py-5 rounded-2xl shadow-glow transition-all flex items-center justify-center gap-3"
                >
                  {isUploading ? (
                    <>
                      <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading... {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ''}
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Post for Approval
                    </>
                  )}
                </button>

                {isUploading && (
                  <button
                    type="button"
                    onClick={() => {
                      if (uploadTaskRef.current) {
                        uploadTaskRef.current.cancel();
                      }
                      setIsUploading(false);
                      setUploadProgress(0);
                      addToast("Upload cancelled", "info");
                    }}
                    className="w-full bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all"
                  >
                    Cancel Upload
                  </button>
                )}

                {uploadProgress > 0 && (
                  <div className="mt-4 w-full bg-white/5 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      className="h-full ultra-gradient shadow-glow"
                    />
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HomeScreen = ({ onNavigate }: { onNavigate: (tab: string) => void }) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [nextMatch, setNextMatch] = useState<MatchItem | null>(null);

  useEffect(() => {
    const qNews = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribeNews = onSnapshot(qNews, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem));
      setNews(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'news');
    });

    const qMatch = query(collection(db, 'matches'), where('isNext', '==', true), limit(1));
    const unsubscribeMatch = onSnapshot(qMatch, (snapshot) => {
      if (!snapshot.empty) {
        setNextMatch({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MatchItem);
      } else {
        setNextMatch(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'matches');
    });

    return () => {
      unsubscribeNews();
      unsubscribeMatch();
    };
  }, []);

  return (
    <div className="pb-32 bg-black">
      {/* Hero Section */}
      <section className="relative h-[420px] w-full overflow-hidden">
        <motion.img 
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 20, repeat: Infinity, repeatType: "reverse" }}
          src="https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&q=80&w=1200" 
          alt="Stadium Crowd" 
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-40 mix-blend-luminosity"
        />
        <div className="absolute inset-0 bg-green-900/20 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4"
          >
            <div className="inline-block px-4 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[10px] font-black text-green-500 uppercase tracking-[0.3em] mb-4">
              Est. 2007
            </div>
            <h3 className="text-7xl font-display font-black text-white tracking-tighter leading-none text-glow uppercase italic">
              HELALA <br />
              <span className="text-green-500">BOYS</span>
            </h3>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Layout */}
      <section className="px-6 -mt-20 relative z-20 space-y-4">
        
        {/* Next Match Card (Full Width) */}
        {nextMatch && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-[2.5rem] p-6 border border-green-500/20 shadow-glow relative overflow-hidden group cursor-pointer"
            onClick={() => onNavigate('news')}
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Calendar size={80} className="text-green-500" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-glow" />
                <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Next Match</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-2xl font-display font-black text-white uppercase tracking-tight">KAC Kenitra</h4>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">vs {nextMatch.opponent}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-display font-black text-white uppercase">{nextMatch.date}</p>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{nextMatch.venue}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Latest News (Large) */}
          <motion.div 
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('news')}
            className="col-span-2 glass-card rounded-[2.5rem] p-6 border border-white/5 shadow-ultra relative overflow-hidden group cursor-pointer h-48"
          >
            <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity duration-500">
              <img 
                src={news[0]?.imageUrl || "https://picsum.photos/seed/news/800/400"} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="relative h-full flex flex-col justify-end">
              <div className="flex items-center gap-2 mb-2">
                <Newspaper size={14} className="text-green-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Latest News</span>
              </div>
              <h4 className="text-xl font-display font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-glow transition-all">
                {news[0]?.title || "Stay Updated with KAC"}
              </h4>
            </div>
          </motion.div>

          {/* Chants (Square) */}
          <motion.div 
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('chants')}
            className="glass-card rounded-[2.5rem] p-6 border border-white/5 shadow-ultra flex flex-col items-center justify-center text-center group cursor-pointer aspect-square"
          >
            <div className="mb-4 rounded-2xl bg-blue-500/10 p-4 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all duration-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <Music className="h-8 w-8" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Chants</span>
          </motion.div>

          {/* Fan Zone (Square) */}
          <motion.div 
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('community')}
            className="glass-card rounded-[2.5rem] p-6 border border-white/5 shadow-ultra flex flex-col items-center justify-center text-center group cursor-pointer aspect-square"
          >
            <div className="mb-4 rounded-2xl bg-purple-500/10 p-4 text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-all duration-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
              <Camera className="h-8 w-8" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Fan Zone</span>
          </motion.div>

          {/* Profile (Horizontal) */}
          <motion.div 
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('profile')}
            className="col-span-2 glass-card rounded-[2.5rem] p-6 border border-white/5 shadow-ultra flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl ultra-gradient flex items-center justify-center text-white shadow-glow group-hover:scale-110 transition-transform duration-500">
                <UserIcon className="h-7 w-7" />
              </div>
              <div>
                <h4 className="text-sm font-display font-black text-white uppercase tracking-tight">My Profile</h4>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Account & Settings</p>
              </div>
            </div>
            <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center text-gray-500 group-hover:bg-green-500 group-hover:text-black transition-all">
              <ChevronRight size={20} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Recent Activity / News Feed */}
      <section className="mt-12 px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h4 className="text-2xl font-display font-black text-white uppercase tracking-tight">Recent Activity</h4>
            <div className="h-1 w-12 ultra-gradient rounded-full mt-1 shadow-glow" />
          </div>
        </div>
        
        <div className="space-y-4">
          {news.slice(1, 4).map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              viewport={{ once: true }}
              onClick={() => onNavigate('news')}
              className="glass rounded-3xl p-4 flex items-center gap-4 border border-white/5 hover:bg-white/5 transition-all cursor-pointer"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10">
                <img src={item.imageUrl} alt={item.title} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-bold text-white truncate">{item.title}</h5>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                  {new Date(item.createdAt).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-700" />
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};

const ProfileScreen = ({ 
  user, 
  userProfile, 
  addToast, 
  handleUpload, 
  compressImage,
  uploadProgress
}: { 
  user: FirebaseUser, 
  userProfile: UserProfile | null,
  addToast: (msg: string, type: 'success' | 'error') => void,
  handleUpload: (file: Blob | File, path: string) => Promise<string>,
  compressImage: (file: File) => Promise<Blob | File>,
  uploadProgress: number
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(userProfile?.displayName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [myPosts, setMyPosts] = useState<FanZonePost[]>([]);
  const [stats, setStats] = useState({ posts: 0, likes: 0 });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'fanzone'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FanZonePost));
      setMyPosts(items);
      const totalLikes = items.reduce((acc, post) => acc + (post.likesCount || 0), 0);
      setStats({ posts: items.length, likes: totalLikes });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'fanzone');
    });
    return () => unsubscribe();
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!newName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newName.trim()
      });
      addToast("Profile updated successfully!", "success");
      setIsEditing(false);
    } catch (error) {
      addToast("Failed to update profile", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file);
      const url = await handleUpload(compressed, `profiles/${user.uid}`);
      await updateDoc(doc(db, 'users', user.uid), {
        photoURL: url
      });
      addToast("Profile picture updated!", "success");
    } catch (error) {
      addToast("Failed to upload photo", "error");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      addToast("Failed to logout", "error");
    }
  };

  return (
    <div className="px-6 pb-32 pt-8">
      {/* Profile Header Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-[3rem] p-8 mb-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <UserIcon size={120} />
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="relative group mb-6">
            <div className="h-32 w-32 rounded-[2.5rem] overflow-hidden border-4 border-green-500/20 shadow-ultra group-hover:border-green-500/50 transition-all duration-500">
              {uploadingPhoto ? (
                <div className="h-full w-full flex flex-col items-center justify-center bg-black/50 backdrop-blur-md">
                  <Loader2 className="h-8 w-8 text-green-500 animate-spin mb-2" />
                  <span className="text-[10px] font-black text-white">{Math.round(uploadProgress)}%</span>
                </div>
              ) : (
                <img 
                  src={userProfile?.photoURL || user.photoURL || ''} 
                  alt="Profile" 
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            <label className="absolute -bottom-2 -right-2 p-3 rounded-2xl bg-green-500 text-black shadow-glow cursor-pointer hover:scale-110 transition-all active:scale-95">
              <Camera size={18} />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>

          {isEditing ? (
            <div className="w-full max-w-xs space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white font-display font-bold focus:outline-none focus:border-green-500 transition-all"
                  placeholder="Your Name"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSaving}
                  className="flex-1 ultra-gradient text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-glow active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={18} />} Save
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-all active:scale-95"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2 mb-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-display font-black text-white tracking-tight uppercase">{userProfile?.displayName || 'Fan'}</h2>
                  <button onClick={() => setIsEditing(true)} className="p-2 text-gray-500 hover:text-green-500 transition-colors">
                    <Edit3 size={18} />
                  </button>
                </div>
                {userProfile?.role && userProfile.role !== 'user' && (
                  <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border ${
                    userProfile.role === 'admin' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                    userProfile.role === 'moderator' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                    'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  }`}>
                    {userProfile.role === 'admin' ? 'Administrator' : 
                     userProfile.role === 'moderator' ? 'Moderator' : 'Verified Fan'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-6">
                <Mail size={12} className="text-green-500/50" />
                {user.email}
              </div>
            </>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 w-full mt-4">
            <div className="glass rounded-3xl p-6 text-center border border-white/5">
              <div className="text-2xl font-display font-black text-white mb-1">{stats.posts}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Posts</div>
            </div>
            <div className="glass rounded-3xl p-6 text-center border border-white/5">
              <div className="text-2xl font-display font-black text-green-500 mb-1">{stats.likes}</div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Total Likes</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Account Info Section */}
      <div className="space-y-4 mb-8">
        <div className="glass rounded-3xl p-6 flex items-center justify-between border border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Role</div>
              <div className="text-sm font-bold text-white capitalize">{userProfile?.role || 'User'}</div>
            </div>
          </div>
          {userProfile?.role === 'admin' && (
            <span className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-black uppercase tracking-widest">Verified</span>
          )}
        </div>

        <div className="glass rounded-3xl p-6 flex items-center justify-between border border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500">
              <Calendar size={20} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Joined</div>
              <div className="text-sm font-bold text-white">
                {userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* My Posts Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">My Fan Zone Posts</h3>
          <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">{myPosts.length} Total</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {myPosts.length > 0 ? myPosts.map((post) => (
            <motion.div 
              key={post.id}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative aspect-square rounded-3xl overflow-hidden glass group"
            >
              <img src={post.mediaUrl} alt="Post" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                <div className="flex items-center gap-1 text-white font-bold">
                  <Heart size={16} className="fill-current text-red-500" />
                  <span className="text-xs">{post.likesCount || 0}</span>
                </div>
                <div className="flex items-center gap-1 text-white font-bold">
                  <MessageCircle size={16} className="text-blue-400" />
                  <span className="text-xs">{post.commentsCount || 0}</span>
                </div>
              </div>
              {post.status === 'pending' && (
                <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-yellow-500/90 text-black text-[8px] font-black uppercase tracking-widest">
                  Pending
                </div>
              )}
            </motion.div>
          )) : (
            <div className="col-span-2 py-12 text-center glass rounded-3xl border border-white/5">
              <Camera size={32} className="mx-auto text-gray-800 mb-4" />
              <p className="text-gray-600 text-sm font-medium">No posts yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Logout Button */}
      <button 
        onClick={handleLogout}
        className="w-full glass border border-red-500/20 text-red-500 font-black uppercase tracking-[0.2em] py-6 rounded-[2rem] flex items-center justify-center gap-3 hover:bg-red-500/10 transition-all active:scale-95"
      >
        <LogOut size={20} /> Sign Out
      </button>
    </div>
  );
};

const AdminPanel = ({ userProfile, addToast, addDebugLog, debugLogs, setDebugLogs, handleUpload, compressImage, uploadProgress }: { 
  userProfile: UserProfile | null,
  addToast: (msg: string, type: 'success' | 'error') => void,
  addDebugLog: (msg: string) => void,
  debugLogs: string[],
  setDebugLogs: Dispatch<SetStateAction<string[]>>,
  handleUpload: (file: Blob | File, path: string) => Promise<string>,
  compressImage: (file: File) => Promise<Blob | File>,
  uploadProgress: number
}) => {
  const permissions = userProfile ? ROLE_PERMISSIONS[userProfile.role] : ROLE_PERMISSIONS.user;
  
  const getInitialSection = () => {
    if (permissions.canManageNews) return 'news';
    if (permissions.canManageFanZone) return 'fanzone';
    if (permissions.canManageUsers) return 'users';
    if (permissions.canManageChants) return 'chants';
    if (permissions.canManageMatches) return 'matches';
    return 'fanzone';
  };

  const [activeSection, setActiveSection] = useState<'news' | 'chants' | 'matches' | 'users' | 'fanzone'>(getInitialSection());
  const [loading, setLoading] = useState(false);
  const uploadTaskRef = useRef<any>(null);

  // Form states
  const [newsForm, setNewsForm] = useState({ title: '', content: '' });
  const [newsImage, setNewsImage] = useState<File | null>(null);
  const [newsPreview, setNewsPreview] = useState<string | null>(null);
  const [chantForm, setChantForm] = useState({ title: '', lyrics: '' });
  const [chantAudio, setChantAudio] = useState<File | null>(null);
  const [matchForm, setMatchForm] = useState({ opponent: '', date: '', venue: '', isNext: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [chants, setChants] = useState<ChantItem[]>([]);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [fanzonePosts, setFanzonePosts] = useState<FanZonePost[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [selectedMedia, setSelectedMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);

  const REJECTION_OPTIONS = [
    "Inappropriate content",
    "Low quality / Blurry",
    "Not related to KAC / Helala Boys",
    "Spam / Advertising",
    "Duplicate post",
    "Offensive language"
  ];

  useEffect(() => {
    let unsubscribeNews = () => {};
    let unsubscribeChants = () => {};
    let unsubscribeMatches = () => {};
    let unsubscribeFanZone = () => {};
    let unsubscribeUsers = () => {};

    if (permissions.canManageNews) {
      const qNews = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
      unsubscribeNews = onSnapshot(qNews, (snapshot) => {
        setNews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsItem)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'news');
      });
    }

    if (permissions.canManageChants) {
      const qChants = query(collection(db, 'chants'), orderBy('createdAt', 'desc'));
      unsubscribeChants = onSnapshot(qChants, (snapshot) => {
        setChants(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChantItem)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'chants');
      });
    }

    if (permissions.canManageMatches) {
      const qMatches = query(collection(db, 'matches'), orderBy('createdAt', 'desc'));
      unsubscribeMatches = onSnapshot(qMatches, (snapshot) => {
        setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchItem)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'matches');
      });
    }

    if (permissions.canManageFanZone) {
      const qFanZone = query(collection(db, 'fanzone'), orderBy('createdAt', 'desc'));
      unsubscribeFanZone = onSnapshot(qFanZone, (snapshot) => {
        setFanzonePosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FanZonePost)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'fanzone');
      });
    }

    if (permissions.canManageUsers && activeSection === 'users') {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubscribeUsers = onSnapshot(q, (snapshot) => {
        setUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    return () => {
      unsubscribeNews();
      unsubscribeChants();
      unsubscribeMatches();
      unsubscribeFanZone();
      unsubscribeUsers();
    };
  }, [activeSection, permissions]);

  const handleApprovePost = async (postId: string) => {
    try {
      const post = fanzonePosts.find(p => p.id === postId);
      await updateDoc(doc(db, 'fanzone', postId), { status: 'approved' });
      addToast("Post approved!", "success");
      
      if (post) {
        await createNotification(post.userId, {
          title: "Post Approved! 🎉",
          message: "Your post has been approved and is now visible in the Fan Zone.",
          type: 'success',
          link: 'activeTab:community'
        });
      }
    } catch (e: any) {
      console.error("Approve error:", e);
      try {
        handleFirestoreError(e, OperationType.UPDATE, `fanzone/${postId}`);
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (err) {}
        addToast(msg || "Failed to approve", "error");
      }
    }
  };

  const handleRejectPost = async (postId: string) => {
    const reason = rejectionReasons[postId];
    if (!reason) return addToast("Please provide a reason for rejection", "error");
    
    try {
      const post = fanzonePosts.find(p => p.id === postId);
      await updateDoc(doc(db, 'fanzone', postId), { 
        status: 'rejected',
        rejectionReason: reason
      });
      addToast("Post rejected", "success");
      
      if (post) {
        await createNotification(post.userId, {
          title: "Post Rejected",
          message: `Your post was rejected. Reason: ${reason}`,
          type: 'error',
          link: 'activeTab:profile'
        });
      }

      setRejectionReasons(prev => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
    } catch (e: any) {
      console.error("Reject error:", e);
      try {
        handleFirestoreError(e, OperationType.UPDATE, `fanzone/${postId}`);
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (err) {}
        addToast(msg || "Failed to reject", "error");
      }
    }
  };

  const handleEditNews = (item: NewsItem) => {
    setNewsForm({ title: item.title, content: item.content });
    setNewsPreview(item.imageUrl);
    setEditingId(item.id);
    setActiveSection('news');
  };

  const handleDelete = async (collectionName: string, id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, collectionName, id));
      addToast("Deleted successfully", "success");
      setDeleteConfirmId(null);
    } catch (error: any) {
      console.error("Delete error:", error);
      try {
        handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (e) {}
        addToast(msg || "Error deleting item", "error");
      }
    }
  };

  const handleAddNews = async (e: FormEvent) => {
    e.preventDefault();
    if (!newsImage && !editingId) return addToast("Please select an image", "error");
    if (!auth.currentUser) return addToast("You must be logged in to post", "error");
    
    setLoading(true);
    addDebugLog(editingId ? "Starting News update process..." : "Starting News post process...");
    try {
      let imageUrl = news.find(n => n.id === editingId)?.imageUrl || '';
      
      if (newsImage) {
        const compressed = await compressImage(newsImage);
        imageUrl = await handleUpload(compressed, 'news');
      }

      addDebugLog("Upload successful, saving to Firestore...");
      
      if (editingId) {
        await updateDoc(doc(db, 'news', editingId), {
          ...newsForm,
          imageUrl,
          updatedAt: Timestamp.now()
        });
        addDebugLog("Firestore update successful");
        addToast("News updated successfully!", "success");
      } else {
        await addDoc(collection(db, 'news'), {
          ...newsForm,
          imageUrl,
          createdAt: Timestamp.now(),
          authorUid: auth.currentUser?.uid,
          likesCount: 0,
          commentsCount: 0
        });
        addDebugLog("Firestore save successful");
        addToast("News posted successfully!", "success");
      }
      
      setNewsForm({ title: '', content: '' });
      setNewsImage(null);
      setNewsPreview(null);
      setEditingId(null);
    } catch (error: any) {
      addDebugLog(`Post news error: ${error.message}`);
      console.error("Post news error:", error);
      try {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'news');
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (e) {}
        addToast(msg || "Failed to post news", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddChant = async (e: FormEvent) => {
    e.preventDefault();
    if (!chantAudio && !editingId) return addToast("Please select an audio file", "error");
    if (!auth.currentUser) return addToast("You must be logged in to post", "error");

    setLoading(true);
    addDebugLog(editingId ? "Starting Chant update process..." : "Starting Chant add process...");
    try {
      let audioUrl = chants.find(c => c.id === editingId)?.audioUrl || '';
      
      if (chantAudio) {
        audioUrl = await handleUpload(chantAudio, 'chants');
      }

      addDebugLog("Audio upload successful, saving to Firestore...");
      
      if (editingId) {
        await updateDoc(doc(db, 'chants', editingId), {
          ...chantForm,
          audioUrl,
          updatedAt: Timestamp.now()
        });
        addDebugLog("Firestore update successful");
        addToast("Chant updated successfully!", "success");
      } else {
        await addDoc(collection(db, 'chants'), {
          ...chantForm,
          audioUrl,
          createdAt: Timestamp.now()
        });
        addDebugLog("Firestore save successful");
        addToast("Chant added successfully!", "success");
      }

      setChantForm({ title: '', lyrics: '' });
      setChantAudio(null);
      setEditingId(null);
    } catch (error: any) {
      addDebugLog(`Add chant error: ${error.message}`);
      console.error("Add chant error:", error);
      try {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'chants');
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (e) {}
        addToast(msg || "Failed to add chant", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddMatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return addToast("You must be logged in to post", "error");

    setLoading(true);
    addDebugLog(editingId ? "Starting Match update process..." : "Starting Match schedule process...");
    try {
      if (matchForm.isNext) {
        addDebugLog("Updating existing matches to remove isNext status...");
        const q = query(collection(db, 'matches'), where('isNext', '==', true));
        const snapshot = await getDocs(q);
        for (const d of snapshot.docs) {
          if (d.id !== editingId) {
            await updateDoc(doc(db, 'matches', d.id), { isNext: false });
          }
        }
      }

      if (editingId) {
        await updateDoc(doc(db, 'matches', editingId), {
          ...matchForm,
          updatedAt: Timestamp.now()
        });
        addDebugLog("Firestore update successful");
        addToast("Match updated!", "success");
      } else {
        addDebugLog("Saving new match to Firestore...");
        await addDoc(collection(db, 'matches'), {
          ...matchForm,
          createdAt: Timestamp.now()
        });
        addDebugLog("Firestore save successful");
        addToast("Match scheduled!", "success");
      }

      setMatchForm({ opponent: '', date: '', venue: '', isNext: false });
      setEditingId(null);
    } catch (error: any) {
      addDebugLog(`Add match error: ${error.message}`);
      console.error("Add match error:", error);
      try {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'matches');
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (e) {}
        addToast(msg || "Failed to schedule match", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: UserProfile['role']) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      addToast(`User role updated to ${newRole}`, "success");
      
      await createNotification(userId, {
        title: "Role Updated",
        message: `Your account role has been updated to ${newRole}.`,
        type: 'info',
        link: 'activeTab:profile'
      });
    } catch (error: any) {
      console.error("Error updating role:", error);
      try {
        handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      } catch (innerError: any) {
        let msg = innerError.message;
        try {
          const parsed = JSON.parse(msg);
          msg = parsed.error || msg;
        } catch (e) {}
        addToast(msg || "Error updating role", "error");
      }
    }
  };

  const handleEditChant = (item: ChantItem) => {
    setEditingId(item.id);
    setChantForm({ title: item.title, lyrics: item.lyrics });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditMatch = (item: MatchItem) => {
    setEditingId(item.id);
    setMatchForm({ opponent: item.opponent, date: item.date, venue: item.venue, isNext: item.isNext });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewsForm({ title: '', content: '' });
    setNewsImage(null);
    setNewsPreview(null);
    setChantForm({ title: '', lyrics: '' });
    setChantAudio(null);
    setMatchForm({ opponent: '', date: '', venue: '', isNext: false });
  };

  return (
    <div className="pb-32 px-6 pt-8">
      <div className="mb-10">
        <h2 className="text-4xl font-display font-black text-green-500 text-glow tracking-tight uppercase">Admin Panel</h2>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mt-2">Manage Helala Boys content</p>
      </div>

      <div className="flex gap-3 mb-10 overflow-x-auto pb-4 scrollbar-hide">
        {[
          { id: 'news', label: 'News', icon: Newspaper, show: permissions.canManageNews },
          { id: 'chants', label: 'Chants', icon: Music2, show: permissions.canManageChants },
          { id: 'matches', label: 'Matches', icon: Calendar, show: permissions.canManageMatches },
          { id: 'users', label: 'Users', icon: Users, show: permissions.canManageUsers },
          { id: 'fanzone', label: 'Fan Zone', icon: Camera, show: permissions.canManageFanZone },
        ].filter(s => s.show).map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap shadow-glow ${
              activeSection === section.id ? 'ultra-gradient text-white scale-105' : 'glass text-gray-500 hover:text-gray-300'
            }`}
          >
            <section.icon className="h-4 w-4" />
            {section.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeSection === 'news' && (
          <motion.form 
            key="news-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleAddNews} 
            className="glass-card p-8 rounded-[2.5rem] space-y-6"
          >
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Title</label>
              <input 
                type="text" 
                required
                value={newsForm.title}
                onChange={(e) => setNewsForm({...newsForm, title: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
                placeholder="Article title"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Image</label>
              <div className="relative group">
                <input 
                  type="file" 
                  accept="image/*"
                  required={!editingId}
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setNewsImage(file);
                    if (file) setNewsPreview(URL.createObjectURL(file));
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-full bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-10 flex flex-col items-center justify-center gap-4 group-hover:border-green-500/50 transition-all overflow-hidden relative">
                  {newsPreview ? (
                    <img src={newsPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                  ) : (
                    <div className="p-4 rounded-2xl bg-green-500/10 text-green-500">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500 relative z-20">
                    {newsImage ? newsImage.name : editingId ? 'Change Image' : 'Select Image'}
                  </span>
                </div>
              </div>
            </div>

            {uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full ultra-gradient shadow-glow"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Content</label>
              <textarea 
                required
                rows={5}
                value={newsForm.content}
                onChange={(e) => setNewsForm({...newsForm, content: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none resize-none transition-all font-medium"
                placeholder="Write news content..."
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full ultra-gradient hover:scale-[1.02] active:scale-[0.98] text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-glow"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {loading ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update News' : 'Add News')}
              </button>
              {editingId && !loading && (
                <button 
                  type="button"
                  onClick={cancelEdit}
                  className="w-full glass hover:bg-white/10 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-12 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-6">Manage News</h3>
              {news.map(item => (
                <div key={item.id} className="flex items-center justify-between glass-card p-4 rounded-2xl group">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl overflow-hidden shadow-glow">
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <p className="text-sm font-display font-bold text-white line-clamp-1 group-hover:text-green-400 transition-colors">{item.title}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handleEditNews(item)} 
                      className="text-green-500 p-3 hover:bg-green-500/10 rounded-xl transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete('news', item.id)} 
                      className={`p-3 rounded-xl transition-all ${
                        deleteConfirmId === item.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'text-red-500 hover:bg-red-500/10'
                      }`}
                    >
                      {deleteConfirmId === item.id ? <CheckCircle2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.form>
        )}

        {activeSection === 'chants' && (
          <motion.form 
            key="chants-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleAddChant} 
            className="glass-card p-8 rounded-[2.5rem] space-y-6"
          >
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Chant Title</label>
              <input 
                type="text" 
                required
                value={chantForm.title}
                onChange={(e) => setChantForm({...chantForm, title: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
                placeholder="e.g. Helala Boys Anthem"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Audio File</label>
              <div className="relative group">
                <input 
                  type="file" 
                  accept="audio/*"
                  required={!editingId}
                  onChange={(e) => setChantAudio(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-full bg-white/5 border-2 border-dashed border-white/10 rounded-[2rem] p-10 flex flex-col items-center justify-center gap-4 group-hover:border-green-500/50 transition-all overflow-hidden relative">
                  <div className="p-4 rounded-2xl bg-green-500/10 text-green-500">
                    <Volume2 className="h-8 w-8" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500 relative z-20">
                    {chantAudio ? chantAudio.name : editingId ? 'Change Audio' : 'Select Audio'}
                  </span>
                </div>
              </div>
            </div>

            {uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full ultra-gradient shadow-glow"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Lyrics</label>
              <textarea 
                required
                rows={6}
                value={chantForm.lyrics}
                onChange={(e) => setChantForm({...chantForm, lyrics: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none resize-none transition-all font-medium"
                placeholder="Enter lyrics..."
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full ultra-gradient hover:scale-[1.02] active:scale-[0.98] text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-glow"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {loading ? (editingId ? 'Updating...' : 'Adding...') : (editingId ? 'Update Chant' : 'Add Chant')}
              </button>
              {editingId && !loading && (
                <button 
                  type="button"
                  onClick={cancelEdit}
                  className="w-full glass hover:bg-white/10 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-12 space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-6">Manage Chants</h3>
              {chants.map(item => (
                <div key={item.id} className="flex items-center justify-between glass-card p-4 rounded-2xl group">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl ultra-gradient flex items-center justify-center shadow-glow">
                      <Music2 className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm font-display font-bold text-white line-clamp-1 group-hover:text-green-400 transition-colors">{item.title}</p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handleEditChant(item)} 
                      className="text-green-500 p-3 hover:bg-green-500/10 rounded-xl transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete('chants', item.id)} 
                      className={`p-3 rounded-xl transition-all ${
                        deleteConfirmId === item.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'text-red-500 hover:bg-red-500/10'
                      }`}
                    >
                      {deleteConfirmId === item.id ? <CheckCircle2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.form>
        )}

        {activeSection === 'matches' && (
          <motion.form 
            key="matches-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleAddMatch} 
            className="glass-card p-8 rounded-[2.5rem] space-y-6"
          >
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Opponent</label>
              <input 
                type="text" 
                required
                value={matchForm.opponent}
                onChange={(e) => setMatchForm({...matchForm, opponent: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
                placeholder="Team name"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Date & Time</label>
              <input 
                type="text" 
                required
                value={matchForm.date}
                onChange={(e) => setMatchForm({...matchForm, date: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
                placeholder="e.g. Sunday, 18:00"
              />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-1">Venue</label>
              <input 
                type="text" 
                required
                value={matchForm.venue}
                onChange={(e) => setMatchForm({...matchForm, venue: e.target.value})}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:border-green-500 outline-none transition-all font-medium"
                placeholder="Stadium name"
              />
            </div>
            <div className="flex items-center gap-4 py-2 px-1">
              <div className="relative flex items-center">
                <input 
                  type="checkbox" 
                  id="isNext"
                  checked={matchForm.isNext}
                  onChange={(e) => setMatchForm({...matchForm, isNext: e.target.checked})}
                  className="peer h-6 w-6 rounded-lg bg-white/5 border-2 border-white/10 text-green-600 focus:ring-green-500 transition-all cursor-pointer appearance-none checked:bg-green-600 checked:border-green-600"
                />
                <CheckCircle2 className="absolute h-4 w-4 text-white opacity-0 peer-checked:opacity-100 left-1 pointer-events-none transition-opacity" />
              </div>
              <label htmlFor="isNext" className="text-sm font-bold text-white cursor-pointer">Set as Next Match</label>
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full ultra-gradient hover:scale-[1.02] active:scale-[0.98] text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-glow"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : editingId ? <Save className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {loading ? (editingId ? 'Updating...' : 'Saving...') : (editingId ? 'Update Match' : 'Add Match')}
              </button>
              {editingId && !loading && (
                <button 
                  type="button"
                  onClick={cancelEdit}
                  className="w-full glass hover:bg-white/10 text-white font-black uppercase tracking-widest py-5 rounded-2xl transition-all"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="mt-12 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Manage Matches</h3>
              {matches.map(item => (
                <div key={item.id} className={`flex items-center justify-between rounded-2xl p-4 ${item.isNext ? 'bg-green-900/20 border border-green-500/30' : 'bg-gray-900'}`}>
                  <div>
                    <p className="text-sm font-bold text-white">vs {item.opponent}</p>
                    <p className="text-[10px] text-gray-500">{item.date}</p>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      type="button"
                      onClick={() => handleEditMatch(item)} 
                      className="text-green-500 p-2 hover:bg-green-500/10 rounded-lg"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete('matches', item.id)} 
                      className={`p-2 rounded-lg transition-all ${
                        deleteConfirmId === item.id ? 'bg-red-600 text-white' : 'text-red-500 hover:bg-red-500/10'
                      }`}
                    >
                      {deleteConfirmId === item.id ? <CheckCircle2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.form>
        )}

        {activeSection === 'users' && (
          <motion.div
            key="users-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">User Management</h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-green-500 bg-green-500/10 px-3 py-1 rounded-full">{users.length} Total</span>
            </div>
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.uid} className="flex flex-col glass-card p-5 rounded-3xl group hover:border-green-500/30 transition-all gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <img src={u.photoURL} alt={u.displayName} className="h-12 w-12 rounded-2xl object-cover border-2 border-white/10 group-hover:border-green-500/50 transition-all" referrerPolicy="no-referrer" />
                        {u.role === 'admin' && (
                          <div className="absolute -top-1 -right-1 bg-green-500 text-white p-1 rounded-lg shadow-glow">
                            <ShieldCheck className="h-3 w-3" />
                          </div>
                        )}
                        {u.role === 'moderator' && (
                          <div className="absolute -top-1 -right-1 bg-purple-500 text-white p-1 rounded-lg shadow-glow">
                            <Shield className="h-3 w-3" />
                          </div>
                        )}
                        {u.role === 'verified' && (
                          <div className="absolute -top-1 -right-1 bg-blue-500 text-white p-1 rounded-lg shadow-glow">
                            <CheckCircle2 className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-display font-bold text-white group-hover:text-green-400 transition-colors">{u.displayName}</p>
                        <p className="text-[10px] font-medium text-gray-500 tracking-tight">{u.email}</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                      u.role === 'admin' ? 'bg-green-500/20 text-green-500' :
                      u.role === 'moderator' ? 'bg-purple-500/20 text-purple-500' :
                      u.role === 'verified' ? 'bg-blue-500/20 text-blue-500' :
                      'bg-gray-500/20 text-gray-500'
                    }`}>
                      {u.role}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {(['user', 'verified', 'moderator', 'admin'] as const).map((role) => (
                      <button
                        key={role}
                        onClick={() => updateUserRole(u.uid, role)}
                        className={`px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                          u.role === role 
                            ? 'ultra-gradient text-white shadow-glow' 
                            : 'glass text-gray-500 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeSection === 'fanzone' && (
          <motion.div
            key="fanzone-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">Fan Zone Moderation</h3>
              <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full">
                {fanzonePosts.filter(p => p.status === 'pending').length} Pending
              </span>
            </div>

            <div className="space-y-6">
              {fanzonePosts.map((post) => (
                <div key={post.id} className="glass-card rounded-[2.5rem] overflow-hidden group hover:border-white/20 transition-all">
                  <div className="p-5 flex items-center justify-between border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <img src={post.userPhoto} alt={post.userName} className="h-8 w-8 rounded-xl border border-white/10" referrerPolicy="no-referrer" />
                      <div className="flex flex-col">
                        <span className="text-xs font-black uppercase tracking-widest text-white">{post.userName}</span>
                        {post.userRole && (
                          <span className={`text-[7px] font-black uppercase tracking-widest ${
                            post.userRole === 'admin' ? 'text-green-500' : 
                            post.userRole === 'moderator' ? 'text-purple-500' :
                            post.userRole === 'verified' ? 'text-blue-500' : 'text-gray-500'
                          }`}>
                            {post.userRole === 'admin' ? 'Admin' : 
                             post.userRole === 'moderator' ? 'Moderator' :
                             post.userRole === 'verified' ? 'Verified Fan' : 'Fan'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm ${
                      post.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/20' :
                      post.status === 'rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/20' :
                      'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      {post.status}
                    </span>
                  </div>
                  
                  <div 
                    className="aspect-video w-full relative overflow-hidden cursor-zoom-in"
                    onClick={() => setSelectedMedia({ url: post.mediaUrl, type: post.mediaType })}
                  >
                    {post.mediaType === 'video' ? (
                      <video src={post.mediaUrl} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    ) : (
                      <img src={post.mediaUrl} alt="Post" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="p-3 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
                        <Plus className="h-6 w-6" />
                      </div>
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex items-center gap-1 text-gray-500">
                        <Heart className="h-3 w-3" />
                        <span className="text-[10px] font-black">{post.likesCount || 0}</span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <MessageCircle className="h-3 w-3" />
                        <span className="text-[10px] font-black">{post.commentsCount || 0}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400 font-medium italic mb-6 leading-relaxed">"{post.caption}"</p>
                    
                    {post.status === 'pending' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Rejection Reason (Required for Reject)</label>
                          <select 
                            value={rejectionReasons[post.id] || ''}
                            onChange={(e) => setRejectionReasons(prev => ({ ...prev, [post.id]: e.target.value }))}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-red-500 outline-none transition-all"
                          >
                            <option value="" disabled className="bg-gray-900">Select a reason...</option>
                            {REJECTION_OPTIONS.map(reason => (
                              <option key={reason} value={reason} className="bg-gray-900">{reason}</option>
                            ))}
                            <option value="Other" className="bg-gray-900">Other (Custom)</option>
                          </select>
                          {rejectionReasons[post.id] === 'Other' && (
                            <input 
                              type="text"
                              placeholder="Type custom reason..."
                              onChange={(e) => setRejectionReasons(prev => ({ ...prev, [post.id]: e.target.value }))}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-red-500 outline-none transition-all mt-2"
                            />
                          )}
                        </div>

                        <div className="flex gap-3">
                          <button 
                            onClick={() => handleApprovePost(post.id)}
                            className="flex-1 ultra-gradient hover:scale-[1.02] active:scale-[0.98] text-white text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 shadow-glow transition-all"
                          >
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </button>
                          <button 
                            onClick={() => handleRejectPost(post.id)}
                            className="flex-1 glass hover:bg-red-500/20 hover:text-red-400 text-white text-[10px] font-black uppercase tracking-widest py-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
                          >
                            <X className="h-4 w-4" /> Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {post.status !== 'pending' && (
                      <div className="flex gap-3">
                        <button 
                          onClick={() => handleDelete('fanzone', post.id)}
                          className={`flex-1 py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest ${
                            deleteConfirmId === post.id 
                              ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
                              : 'glass text-red-500 hover:bg-red-500/10'
                          }`}
                        >
                          {deleteConfirmId === post.id ? <CheckCircle2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          {deleteConfirmId === post.id ? 'Confirm Delete' : 'Delete Post'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Media Viewer Modal */}
            <AnimatePresence>
              {selectedMedia && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl"
                  onClick={() => setSelectedMedia(null)}
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative max-w-5xl w-full max-h-full rounded-3xl overflow-hidden shadow-2xl border border-white/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button 
                      onClick={() => setSelectedMedia(null)}
                      className="absolute top-6 right-6 z-10 p-3 rounded-full bg-black/50 text-white hover:bg-white/10 transition-all border border-white/10"
                    >
                      <X className="h-6 w-6" />
                    </button>
                    {selectedMedia.type === 'video' ? (
                      <video src={selectedMedia.url} controls autoPlay className="w-full h-auto max-h-[85vh] object-contain" />
                    ) : (
                      <img src={selectedMedia.url} alt="Full view" className="w-full h-auto max-h-[85vh] object-contain" referrerPolicy="no-referrer" />
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
        
        {/* Debug Logs Section */}
        <div className="mt-12 p-4 bg-black/40 rounded-xl border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
              <Terminal size={20} className="text-green-500" />
              Debug Logs
            </h3>
            <div className="flex gap-2">
              <button 
                onClick={async () => {
                  addDebugLog("[Test] Starting storage test...");
                  try {
                    const blob = new Blob(["test"], { type: "text/plain" });
                    const url = await handleUpload(blob, "test");
                    addDebugLog(`[Test] Success! URL: ${url}`);
                    addToast("Storage test successful!", "success");
                  } catch (e: any) {
                    addDebugLog(`[Test] Failed: ${e.message}`);
                    addToast("Storage test failed", "error");
                  }
                }}
                className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
              >
                Test Storage
              </button>
              <button 
                onClick={() => setDebugLogs([])}
                className="text-xs text-gray-400 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto font-mono text-[10px] space-y-1">
            {debugLogs.length === 0 ? (
              <p className="text-gray-500 italic">No logs yet...</p>
            ) : (
              debugLogs.map((log, i) => (
                <div key={i} className="text-gray-300 border-b border-white/5 pb-1 leading-tight">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [currentChant, setCurrentChant] = useState<ChantItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/notifications`);
    });

    return () => unsubscribe();
  }, [user]);

  const handleMarkAsRead = async (notificationId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/notifications/${notificationId}`);
    }
  };

  const handleClearAllNotifications = async () => {
    if (!user || notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach(notif => {
        batch.delete(doc(db, 'users', user.uid, 'notifications', notif.id));
      });
      await batch.commit();
      addToast("Notifications cleared", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/notifications`);
    }
  };

  const handleNotificationNavigate = (link: string) => {
    if (link.startsWith('activeTab:')) {
      const tab = link.replace('activeTab:', '');
      setActiveTab(tab);
      setShowNotifications(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => setIsPlaying(false));
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', () => setIsPlaying(false));
      }
    };
  }, []);

  const playChant = (chant: ChantItem) => {
    if (!audioRef.current) return;

    if (currentChant?.id === chant.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      audioRef.current.src = chant.audioUrl;
      audioRef.current.play();
      setCurrentChant(chant);
      setIsPlaying(true);
    }
  };

  const [uploadProgress, setUploadProgress] = useState(0);

  const compressImage = (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      
      addDebugLog(`Starting compression for ${file.name} (${(file.size / 1024).toFixed(2)}KB)`);
      
      const timeout = setTimeout(() => {
        addDebugLog(`Compression timed out for ${file.name}, using original`);
        resolve(file);
      }, 15000);

      // Use modern createImageBitmap for faster, non-blocking image processing
      if (window.createImageBitmap) {
        createImageBitmap(file)
          .then((img) => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            let width = img.width;
            let height = img.height;

            if (width > MAX_WIDTH) {
              height = (MAX_WIDTH / width) * height;
              width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            img.close(); // Free memory

            canvas.toBlob(
              (blob) => {
                clearTimeout(timeout);
                if (blob) {
                  addDebugLog(`Compressed image to ${(blob.size / 1024).toFixed(2)}KB`);
                  resolve(blob);
                } else {
                  addDebugLog(`Compression failed (no blob), using original`);
                  resolve(file);
                }
              },
              'image/jpeg',
              0.75
            );
          })
          .catch((err) => {
            addDebugLog(`createImageBitmap error: ${err.message}, falling back to FileReader`);
            fallbackToFileReader(file, timeout, resolve);
          });
      } else {
        fallbackToFileReader(file, timeout, resolve);
      }
    });
  };

  const fallbackToFileReader = (file: File, timeout: NodeJS.Timeout, resolve: (val: Blob | File) => void) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = (MAX_WIDTH / width) * height;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            clearTimeout(timeout);
            if (blob) {
              addDebugLog(`Compressed image to ${(blob.size / 1024).toFixed(2)}KB`);
              resolve(blob);
            } else {
              addDebugLog(`Compression failed (no blob), using original`);
              resolve(file);
            }
          },
          'image/jpeg',
          0.75
        );
      };
      img.onerror = () => {
        clearTimeout(timeout);
        addDebugLog(`Image load error during compression, using original`);
        resolve(file);
      };
    };
    reader.onerror = () => {
      clearTimeout(timeout);
      addDebugLog(`FileReader error during compression, using original`);
      resolve(file);
    };
  };

  const handleUpload = (file: Blob | File, path: string, onTaskCreated?: (task: any) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!navigator.onLine) {
        return reject(new Error("No internet connection. Please check your network."));
      }

      let settled = false;
      const safeResolve = (val: string) => {
        if (settled) return;
        settled = true;
        setUploadProgress(0);
        resolve(val);
      };
      const safeReject = (err: Error) => {
        if (settled) return;
        settled = true;
        setUploadProgress(0);
        reject(err);
      };

      const fileName = (file as File).name || `upload_${Date.now()}`;
      addDebugLog(`[Upload] Starting: ${fileName} (${(file.size / 1024).toFixed(2)}KB)`);

      const isAudio = file.type.startsWith('audio/') || 
                      fileName.toLowerCase().endsWith('.mp3') || 
                      fileName.toLowerCase().endsWith('.wav') || 
                      fileName.toLowerCase().endsWith('.opus') || 
                      fileName.toLowerCase().endsWith('.m4a') ||
                      fileName.toLowerCase().endsWith('.aac') ||
                      fileName.toLowerCase().endsWith('.ogg') ||
                      fileName.toLowerCase().endsWith('.flac') ||
                      fileName.toLowerCase().endsWith('.webm');
                      
      const maxAllowedSize = isAudio ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
      if (file.size > maxAllowedSize) {
        addDebugLog(`[Upload] File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB (Max: ${maxAllowedSize / 1024 / 1024}MB)`);
        return safeReject(new Error(`File is too large (max ${(maxAllowedSize / 1024 / 1024).toFixed(0)}MB)`));
      }

      const storageRef = ref(storage, `${path}/${Date.now()}_${fileName}`);
      
      // For files up to 20MB, use uploadBytes for much better reliability on mobile/slow connections
      if (file.size < 20 * 1024 * 1024) { 
        addDebugLog(`[Upload] Using uploadBytes (Single-shot) for reliability`);
        setUploadProgress(5);
        
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 95) return prev;
            // Slower progress simulation to manage expectations
            return prev + (prev < 50 ? 1 : 0.5);
          });
        }, 1000);

        uploadBytes(storageRef, file)
          .then(async (snapshot) => {
            clearInterval(progressInterval);
            setUploadProgress(100);
            addDebugLog(`[Upload] uploadBytes successful`);
            const url = await getDownloadURL(snapshot.ref);
            safeResolve(url);
          })
          .catch((err) => {
            clearInterval(progressInterval);
            addDebugLog(`[Upload] uploadBytes failed: ${err.message}`);
            safeReject(new Error(`Upload failed. Your connection might be too weak. Try again or use a smaller file.`));
          });
        return;
      }

      const timeoutDuration = isAudio ? 1800000 : 900000; // 30 mins for audio, 15 mins for others
      addDebugLog(`[Upload] Calling uploadBytesResumable...`);
      setUploadProgress(1);
      
      const uploadTask = uploadBytesResumable(storageRef, file);
      if (onTaskCreated) onTaskCreated(uploadTask);

      const timeout = setTimeout(() => {
        if (settled) return;
        addDebugLog(`[Upload] TIMEOUT after ${timeoutDuration/1000}s`);
        uploadTask.cancel();
        safeReject(new Error(`Upload timed out. Your connection might be too slow for this file size.`));
      }, timeoutDuration);

      let lastBytes = 0;
      let lastProgressTime = Date.now();
      let slowCount = 0;

      const progressCheckInterval = setInterval(() => {
        if (settled) {
          clearInterval(progressCheckInterval);
          return;
        }
        const now = Date.now();
        if (now - lastProgressTime > 45000) {
          addDebugLog(`[Upload] No progress for 45s. Connection might be unstable.`);
          slowCount++;
          if (slowCount > 2) {
            addToast("Upload is very slow. Check your connection.", "error");
          }
        }
      }, 15000);

      uploadTask.on('state_changed', 
        (snapshot) => {
          if (settled) return;
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          
          if (snapshot.bytesTransferred > lastBytes) {
            const now = Date.now();
            const timeDiff = (now - lastProgressTime) / 1000;
            const bytesDiff = snapshot.bytesTransferred - lastBytes;
            
            if (timeDiff > 1) {
              const speedKBps = (bytesDiff / 1024) / timeDiff;
              if (speedKBps < 10) {
                addDebugLog(`[Upload] Slow speed: ${speedKBps.toFixed(2)} KB/s`);
              }
              lastBytes = snapshot.bytesTransferred;
              lastProgressTime = now;
            }
          }
          
          setUploadProgress(Math.max(1, Math.min(99, progress)));
        }, 
        (error) => {
          if (settled) return;
          clearInterval(progressCheckInterval);
          clearTimeout(timeout);
          if (error.code === 'storage/canceled') return;
          addDebugLog(`[Upload] Error: ${error.code || error.message}`);
          safeReject(new Error(`Upload failed: ${error.message}.`));
        }, 
        async () => {
          if (settled) return;
          clearInterval(progressCheckInterval);
          clearTimeout(timeout);
          setUploadProgress(100);
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            safeResolve(downloadURL);
          } catch (error: any) {
            safeReject(error);
          }
        }
      );
    });
  };

  const addDebugLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    console.log(`[DEBUG] ${msg}`);
  };

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Use a safe wrapper for addDebugLog to avoid "not defined" errors if called too early
        const log = (msg: string) => {
          if (typeof addDebugLog === 'function') {
            addDebugLog(msg);
          } else {
            console.log(`[EARLY DEBUG] ${msg}`);
          }
        };

        log(`[Init] Storage Bucket: ${storage.app.options.storageBucket || 'MISSING'}`);
        log(`[Init] Project ID: ${storage.app.options.projectId}`);
        // Simple test to check Firestore connectivity
        await getDocs(query(collection(db, 'news'), limit(1)));
        console.log("Firestore connection test successful");
        
        // Test Storage connectivity
        const storageTestRef = ref(storage, 'test_connection');
        // We don't actually upload, just check if we can get a ref
        console.log("Storage connection test: Ref created");
      } catch (error) {
        console.error("Connection test failed:", error);
        if (error instanceof Error && error.message.includes('the client is offline')) {
          addToast("Firebase configuration error: Client is offline.", "error");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        const isAdminEmail = user.email === "hassanaglim12@gmail.com";
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          // If they are the admin email but don't have the admin role, upgrade them
          if (isAdminEmail && data.role !== 'admin') {
            await updateDoc(userRef, { role: 'admin' });
            setUserProfile({ ...data, role: 'admin' });
          } else {
            setUserProfile(data);
          }
        } else {
          // Create new user
          const newProfile: UserProfile = {
            uid: user.uid,
            displayName: user.displayName || 'Fan',
            email: user.email || '',
            photoURL: user.photoURL || '',
            role: isAdminEmail ? 'admin' : 'user',
            createdAt: new Date().toISOString()
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="h-8 w-8 rounded-full border-2 border-green-600 border-t-transparent"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  const isAdmin = userProfile?.role === 'admin' || user?.email === "hassanaglim12@gmail.com";
  const isModerator = userProfile?.role === 'moderator';

  return (
    <div className="min-h-screen bg-black font-sans text-white">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      <PersistentPlayer 
        currentChant={currentChant} 
        isPlaying={isPlaying} 
        onToggle={() => currentChant && playChant(currentChant)}
        onClose={() => {
          if (audioRef.current) audioRef.current.pause();
          setIsPlaying(false);
          setCurrentChant(null);
        }}
      />

      <Header 
        user={user} 
        userProfile={userProfile} 
        onNavigate={setActiveTab}
        unreadNotificationsCount={unreadCount}
        onOpenNotifications={() => setShowNotifications(true)}
      />
      
      <AnimatePresence>
        {showNotifications && (
          <NotificationsModal 
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onMarkAsRead={handleMarkAsRead}
            onClearAll={handleClearAllNotifications}
            onNavigate={handleNotificationNavigate}
          />
        )}
      </AnimatePresence>
      
      <main className="mx-auto max-w-md">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <HomeScreen onNavigate={setActiveTab} />
            </motion.div>
          )}
          {activeTab === 'news' && (
            <motion.div
              key="news"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <NewsScreen user={user} addToast={addToast} />
            </motion.div>
          )}
          {activeTab === 'chants' && (
            <motion.div
              key="chants"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ChantsScreen 
                currentChant={currentChant}
                isPlaying={isPlaying}
                onPlay={playChant}
              />
            </motion.div>
          )}
          {activeTab === 'community' && (
            <motion.div
              key="community"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CommunityScreen 
                user={user} 
                userProfile={userProfile}
                addToast={addToast} 
                handleUpload={handleUpload}
                compressImage={compressImage}
                uploadProgress={uploadProgress}
              />
            </motion.div>
          )}
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ProfileScreen 
                user={user} 
                userProfile={userProfile} 
                addToast={addToast} 
                handleUpload={handleUpload}
                compressImage={compressImage}
                uploadProgress={uploadProgress}
              />
            </motion.div>
          )}
          {activeTab === 'admin' && (isAdmin || isModerator) && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminPanel 
                userProfile={userProfile}
                addToast={addToast} 
                addDebugLog={addDebugLog} 
                debugLogs={debugLogs} 
                setDebugLogs={setDebugLogs} 
                handleUpload={handleUpload}
                compressImage={compressImage}
                uploadProgress={uploadProgress}
              />
            </motion.div>
          )}
          {!['home', 'news', 'chants', 'community', 'admin'].includes(activeTab) && (
            <motion.div
              key="other"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex h-[60vh] flex-col items-center justify-center p-12 text-center"
            >
              <div className="mb-4 rounded-full bg-green-900/20 p-6 text-green-500">
                <Settings className="h-12 w-12" />
              </div>
              <h3 className="text-xl font-bold">Coming Soon</h3>
              <p className="mt-2 text-gray-500">We are working hard to bring you the {activeTab} section.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} isAdmin={isAdmin || isModerator} />
    </div>
  );
}
