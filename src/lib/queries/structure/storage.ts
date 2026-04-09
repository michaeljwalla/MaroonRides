import { Route } from '@lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoutes } from '../app';
import { useDependencyQuery, useLoggingQuery } from '../utils';

export enum StorageQueryKey {
  FAVORITES = 'favorites',
  FAVORITE = 'favorite',
  DEFAULT_ROUTE_GROUP = 'defaultRouteGroup',
  FAVORITE_LOCATIONS = 'favoriteLocations',
}

export enum StorageMutationKey {
  ADD_FAVORITE = 'addFavorite',
  REMOVE_FAVORITE = 'removeFavorite',
  DEFAULT_ROUTE_GROUP = 'defaultRouteGroup',
}

export enum StorageKey {
  FAVORITES = 'favorites',
  DEFAULT_ROUTE_GROUP = 'default-group',
  FAVORITE_LOCATIONS = 'favoriteLocations',
  SYSTEM_THEME = 'system-theme',
  APP_THEME = 'app-theme',
  ROUTE_CACHE = "route-cache",
}

/**
 * Returns two booleans, "hard" and "soft". true = expired
 * 
 * hard: every 48h\
 * soft: start of every hour
 */
const cacheIsExpired = (t1: number, t2: number) => {
  const HARD_ROUTE_EXPIRY_MS = 60 * 60 * 48 * 1000 // 48h expiry
  const HOUR_MS = 60 * 60 * 1000;

  return {
    hard: (t2 - t1) > HARD_ROUTE_EXPIRY_MS,
    soft: Math.floor(t1 / HOUR_MS) < Math.floor(t2 / HOUR_MS)
  };
}
interface RouteCache {
  routes: Route[],
  timestamp: number
}

/**
 * [null, false] -> hard expiry / no data present.\
 * [Route[], false] -> soft expiry\
 * [Route[], true]  -> no refetch needed
 */
export async function fetchCachedRoutes(): Promise<[Route[] | null, boolean]> {
  let routes: Route[] | null = null;
  try {
    const data = await AsyncStorage.getItem(StorageKey.ROUTE_CACHE);
    if (!data) return [null, false];
    const cache: RouteCache = JSON.parse(data)
    const expired = cacheIsExpired(cache.timestamp, Date.now());
    if (!expired.hard) {
      return [cache.routes, !expired.soft]
    }
  }
  catch {
    //TODO: flag some error here if substantial.
  }
  return [null, false]; //hard expire/error
}
export async function saveRoutesToCache(routes: Route[]): Promise<void> {
  try {
    const cache: RouteCache = { routes, timestamp: Date.now() };
    await AsyncStorage.setItem(
      StorageKey.ROUTE_CACHE,
      JSON.stringify(cache)
    );
  } catch {
    //TODO: flag some error here, if substantial.
  }
  return;
}
export const useFavorites = ({ enabled = true } = {}) => {
  const routesQuery = useRoutes({ enabled: enabled });

  const query = useDependencyQuery<Route[]>({
    queryKey: [StorageQueryKey.FAVORITES],
    queryFn: async () => {
      const routes = routesQuery.data!;

      const favorites = await AsyncStorage.getItem(StorageKey.FAVORITES);
      if (!favorites) return [];

      let favoritesArray = JSON.parse(favorites);

      // set the favorite routes
      return routes.filter((route) => favoritesArray.includes(route.routeCode));
    },

    staleTime: Infinity,
    dependents: [routesQuery],
  });

  return query;
};

export const useFavorite = (routeShortName: string) => {
  const query = useLoggingQuery({
    queryKey: [StorageQueryKey.FAVORITE, routeShortName],
    queryFn: async () => {
      const favorites = await AsyncStorage.getItem(StorageKey.FAVORITES);
      if (!favorites) return false;

      let favoritesArray = JSON.parse(favorites);

      return favoritesArray.includes(routeShortName);
    },
    staleTime: Infinity,
  });

  return query;
};

export const addFavoriteMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: [StorageMutationKey.ADD_FAVORITE],
    mutationFn: async (routeShortName: string) => {
      const favorites = await AsyncStorage.getItem(StorageKey.FAVORITES);

      let favoritesArray = JSON.parse(favorites ?? '[]');

      favoritesArray.push(routeShortName);

      await AsyncStorage.setItem(
        StorageKey.FAVORITES,
        JSON.stringify(favoritesArray),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [StorageQueryKey.FAVORITES],
      });
      await queryClient.invalidateQueries({
        queryKey: [StorageQueryKey.FAVORITE],
      });
    },
  });

  return mutation;
};

export const removeFavoriteMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: [StorageMutationKey.REMOVE_FAVORITE],
    mutationFn: async (routeShortName: string) => {
      const favorites = await AsyncStorage.getItem(StorageKey.FAVORITES);

      let favoritesArray = JSON.parse(favorites ?? '[]');

      const newFavorites = favoritesArray.filter(
        (fav: string) => fav !== routeShortName,
      );

      await AsyncStorage.setItem(
        StorageKey.FAVORITES,
        JSON.stringify(newFavorites),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [StorageQueryKey.FAVORITES],
      });
      await queryClient.invalidateQueries({
        queryKey: [StorageQueryKey.FAVORITE],
      });
    },
  });

  return mutation;
};

export const useDefaultRouteGroup = () => {
  const query = useLoggingQuery<number>({
    queryKey: [StorageQueryKey.DEFAULT_ROUTE_GROUP],
    queryFn: async () => {
      const defaultGroup = await AsyncStorage.getItem(
        StorageKey.DEFAULT_ROUTE_GROUP,
      );
      if (!defaultGroup) return 0;

      return Number(defaultGroup);
    },
    staleTime: Infinity,
  });

  return query;
};

export const defaultGroupMutation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationKey: [StorageMutationKey.DEFAULT_ROUTE_GROUP],
    mutationFn: async (group: number) => {
      await AsyncStorage.setItem(
        StorageKey.DEFAULT_ROUTE_GROUP,
        group.toString(),
      );
      await queryClient.invalidateQueries({
        queryKey: [StorageQueryKey.DEFAULT_ROUTE_GROUP],
      });
    },
  });

  return mutation;
};

export default useFavorites;

