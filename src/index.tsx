import * as React from 'react';
import createPersistedState from 'use-persisted-state';

const STORAGE_KEY = 'APP_VERSION';

const defaultProps = {
  duration: 60 * 1000,
  auto: false,
  storageKey: STORAGE_KEY,
  basePath: '',
  filename: 'meta.json',
};

type OwnProps = {
  duration?: number;
  auto?: boolean;
  storageKey?: string;
  basePath?: string;
  filename?: string;
  children?: any;
};

type Result = {
  loading: boolean,
  isLatestVersion: boolean;
  emptyCacheStorage: (version?:string | undefined) => Promise<void>
}

const ClearCacheContext = React.createContext<Result>({} as Result);

export const ClearCacheProvider: React.FC<OwnProps> = props => {
  const { children, ...otherProps } = props;
  const result = useClearCache(otherProps);
  return (
    <ClearCacheContext.Provider value={result}>
      {children}
    </ClearCacheContext.Provider>
  );
};

export const useClearCacheCtx = () => React.useContext(ClearCacheContext);

let fetchCacheTimeout: any;

export const useClearCache = (props?: OwnProps) => {
  const { duration, auto, storageKey, basePath, filename } = {
    ...defaultProps,
    ...props
  };

  const getStorageKey = (): string => {
    try {
      const version = localStorage.getItem(storageKey);
      if (!version) {
        localStorage.removeItem(storageKey);
        return storageKey;
      }

      JSON.parse(version);

      return storageKey;
    } catch (e) {
      console.warn(e);
      localStorage.removeItem(storageKey);

      return storageKey;
    }
  }

  const [loading, setLoading] = React.useState(true);
  const useAppVersionState = createPersistedState(getStorageKey());
  const [appVersion, setAppVersion] = useAppVersionState('');
  const [isLatestVersion, setIsLatestVersion] = React.useState(true);
  const [latestVersion, setLatestVersion] = React.useState(appVersion);

  const emptyCacheStorage = async (version?: string) => {
    if ('caches' in window) {
      // Service worker cache should be cleared with caches.delete()
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map(key => {
        window.caches.delete(key)
      }));
    }

    // clear browser cache and reload page
    setAppVersion(version || latestVersion);
    window.location.replace(window.location.href);
  };

  // Replace any last slash with an empty space
  const baseUrl = basePath.replace(/\/+$/, '') + '/' + filename;

  function fetchMeta() {
    fetch(baseUrl, {
      cache: 'no-store'
    })
      .then(response => response && response.json().catch(error => console.warn(error)))
      .then(meta => {
        const newVersion = (meta && meta.version) || '';
        const currentVersion = appVersion;
        const isUpdated = newVersion && newVersion === currentVersion;
        if (!isUpdated && !auto) {
          setLatestVersion(newVersion);
          setLoading(false);
          if (appVersion) {
            setIsLatestVersion(false);
          } else {
            setAppVersion(newVersion);
          }
        } else if (!isUpdated && auto) {
          emptyCacheStorage(newVersion);
        } else {
          setIsLatestVersion(true);
          setLoading(false);
        }
      })
      .catch(err => console.warn('react-clear-cache ERROR!', err))
  }

  React.useEffect(() => {
    fetchCacheTimeout = setInterval(() => fetchMeta(), duration);
    return () => {
      clearInterval(fetchCacheTimeout);
    };
  }, [loading]);

  const startVersionCheck = React.useRef(() => {});
  const stopVersionCheck = React.useRef(() => {});

  startVersionCheck.current = () => {
    if (window.navigator.onLine) {
      fetchCacheTimeout = setInterval(() => fetchMeta(), duration);
    }
  };

  stopVersionCheck.current = () => {
    clearInterval(fetchCacheTimeout);
  };

  React.useEffect(() => {
    window.addEventListener('focus', startVersionCheck.current);
    window.addEventListener('blur', stopVersionCheck.current);

    return () => {
      window.removeEventListener('focus', startVersionCheck.current);
      window.removeEventListener('blur', stopVersionCheck.current);
    };
  }, []);

  React.useEffect(() => {
    fetchMeta();
  }, []);

  return {
    loading,
    isLatestVersion,
    emptyCacheStorage,
    latestVersion
  };
};

const ClearCache: React.FC<OwnProps> = props => {
  const { loading, isLatestVersion, emptyCacheStorage } = useClearCache(props);

  const { children } = props;

  return children({
    loading,
    isLatestVersion,
    emptyCacheStorage
  });
};

export default ClearCache;
