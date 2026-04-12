import {
  FontAwesome,
  FontAwesome6,
  MaterialCommunityIcons,
  MaterialIcons,
} from '@expo/vector-icons';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { SegmentedControlEvent } from '@lib/utils/utils';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  _pushSuccessVehicleCallback
} from '@lib/queries/api/aggie_spirit';
import { useRoutes } from '@lib/queries/app';
import {
  clearRoutesCache,
  fetchCachedRoutes,
  saveRoutesToCache,
  useDefaultRouteGroup,
  useFavorites
} from '@lib/queries/structure/storage';
import useAppStore from '@lib/state/app_state';
import { useTheme } from '@lib/state/utils';
import { Route } from '@lib/types';
import { appLogger } from '@lib/utils/logger';
import { Sheets, useSheetController } from '../providers/sheet-controller';
import BusIcon from '../ui/BusIcon';
import IconPill from '../ui/IconPill';
import SheetHeader from '../ui/SheetHeader';
import BaseSheet, { SheetProps } from './BaseSheet';
//

const formatLastUpdated = (ms: number): string => {
  const date = new Date(ms);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
//


// Display routes list for all routes and favorite routes
const RoutesList: React.FC<SheetProps> = ({ sheetRef }) => {
  const snapPoints = ['25%', '45%', '85%'];

  const { presentSheet } = useSheetController();
  const selectedAlert = useAppStore((state) => state.selectedAlert);
  const setSelectedRoute = useAppStore((state) => state.setSelectedRoute);
  const selectedRoute = useAppStore((state) => state.selectedRoute);
  const selectedRouteCategory = useAppStore(
    (state) => state.selectedRouteCategory,
  );
  const setSelectedRouteCategory = useAppStore(
    (state) => state.setSelectedRouteCategory,
  );
  const setDrawnRoutes = useAppStore((state) => state.setDrawnRoutes);
  const theme = useTheme();


  const [showUpdateSpinner, setShowUpdateSpinner] = useState(true);
  const [showReloadButton, setShowReloadButton] = useState(true);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);

  const toggleUpdateSpinner = (show: boolean) => setShowUpdateSpinner(show);
  const toggleUpdateReload = (show: boolean) => setShowReloadButton(show);
  const updateLastUpdated = (ms: number) => setLastUpdatedMs(ms);

  // Queries
  const [cachedRoutes, setCachedRoutes] = useState<Route[] | null>(null);
  const [doRefetch, setDoRefetch] = useState<boolean>(true);
  const [routeAPIError, setRouteAPIError] = useState<boolean>(false);
  const [doManualRefetch, setDoManualRefetch] = useState<boolean>(false);
  const [lastSuccessfulCacheMS, setLastSuccessfulCacheMS] = useState<number | null>(null);

  const updateCachedRoutes = (data: [Route[] | null, boolean, number]) => {
    if (data[0]) {
      setCachedRoutes(data[0]);
      setLastUpdatedMs(data[2]);
      setLastSuccessfulCacheMS(Date.now());
    } else {
      setLastUpdatedMs(null);
      setLastSuccessfulCacheMS(null);
    }
  }

  //attempts to grab cached routes
  useEffect(() => {
    fetchCachedRoutes().then((cached) => {
      updateCachedRoutes(cached);

      const willRefetch = !cached[1];
      setDoRefetch(willRefetch)
      appLogger.i(`Prefaced with cached routes: ${!!cached[0]}`)
      appLogger.i(`Requested refetch: ${willRefetch ? (cached[0] ? "Soft" : "Hard") : "None"}`);

      //disallow reload when already attempting
      // toggleUpdateReload(!willRefetch);
      toggleUpdateSpinner(willRefetch);
    });
  }, []);

  //hook every vehicle query to update lastUpdatedMs (meh)
  useEffect(() => {
    const cb = () => { setLastUpdatedMs(Date.now()); }
    _pushSuccessVehicleCallback(cb); //goto defn here
  }, []);

  const {
    data: _routes,
    isLoading: isRoutesLoading,
    isError: routeError,
    refetch: reRequestRoutes
  } = useRoutes({ enabled: doRefetch });

  //changed logic to default to cachedRoutes
  const routes = isRoutesLoading ? cachedRoutes : _routes ?? cachedRoutes;

  useEffect(() => {
    if ((routes === cachedRoutes) || isRoutesLoading || !(routes)) return;
    setRouteAPIError(!routes.length);

    if (doRefetch || doManualRefetch)
      (async () => {
        if (routes.length) {
          await clearRoutesCache();
          await saveRoutesToCache(routes);
          updateCachedRoutes(await fetchCachedRoutes());
        }
        toggleUpdateSpinner(false);
      })();
    setDoManualRefetch(false);
    //
    setLastUpdatedMs(lastSuccessfulCacheMS);
    if (routeAPIError) setTimeout(() => { toggleUpdateReload(true) }, 1000 * 5);

  }, [routes]);

  const onRequestedReload = async () => {
    toggleUpdateSpinner(true);
    toggleUpdateReload(false);
    if (routes) routes.length = 0;
    setDrawnRoutes([]);
    appLogger.i("User requests manual refetch.");
    await reRequestRoutes();
    setDoManualRefetch(true);
  }
  const {
    data: favorites,
    isLoading: isFavoritesLoading,
    isError: isFavoritesError,
    refetch: refetchFavorites,
  } = useFavorites(routes);

  const { data: defaultGroup, refetch: refetchDefaultGroup } =
    useDefaultRouteGroup();

  useEffect(() => {
    if (!routes || defaultGroup === undefined) return;
    refetchFavorites().then(() => {
      if (!selectedRoute && !selectedAlert) {
        setDrawnRoutes(filteredRoutes.length > 0 ? filteredRoutes : routes);
      }
    });
  }, [routes, defaultGroup]);

  const selectRoute = (selectedRoute: Route) => {
    setSelectedRoute(selectedRoute);
    setDrawnRoutes([selectedRoute]);
    presentSheet(Sheets.ROUTE_DETAILS);
  };

  const filteredRoutes = useMemo(() => {
    if (!routes) return [];

    switch (selectedRouteCategory) {
      case 'All Routes':
        return routes;
      case 'Gameday':
        return routes.filter((route) => route.name.includes('Gameday'));
      case 'Favorites':
        return favorites ?? [];
    }
  }, [selectedRouteCategory, routes, favorites]);

  type RouteCategory = 'All Routes' | 'Gameday' | 'Favorites';
  const hasGameday = useMemo(
    () => !!routes?.some((r) => r.name.includes('Gameday')),
    [routes]
  );

  //switch dependence to more-relevant field
  //prevents pill buttons from regenerating when transitioning from cache to live
  const routeCategories = useMemo<RouteCategory[]>(() => {
    return hasGameday
      ? ['All Routes', 'Gameday', 'Favorites']
      : ['All Routes', 'Favorites'];
  }, [hasGameday]);

  useEffect(() => {
    setSelectedRouteCategory(defaultGroup === 0 ? 'All Routes' : 'Favorites');
  }, [defaultGroup]);

  // only update the map if we have routes
  // and there is no selected route (route details handles state)
  useEffect(updateDrawnRoutes, [filteredRoutes, selectedRoute]);

  const setCategory = (evt: SegmentedControlEvent) => {
    setSelectedRouteCategory(
      routeCategories[evt.nativeEvent.selectedSegmentIndex] ?? 'All Routes',
    );
  };

  function updateDrawnRoutes() {
    if (!routes || selectedRoute || selectedAlert) return;
    if (isFavoritesLoading && selectedRouteCategory === 'Favorites') return; // wait for favorites

    const routesToDraw =
      selectedRouteCategory === 'Favorites'
        ? (favorites ?? [])
        : filteredRoutes.length > 0
          ? filteredRoutes
          : routes; //default

    setDrawnRoutes(routesToDraw);
  }
  // useEffect(updateDrawnRoutes, [filteredRoutes, selectedRoute, selectedAlert, isFavoritesLoading, selectedRouteCategory]);

  async function onPresent() {
    await refetchDefaultGroup();
    await refetchFavorites();

    appLogger.i('Refetched route groups and favorites on sheet present');
  }

  function isFavorite(route: Route) {
    return !!favorites?.find((fav) => fav.routeCode === route.routeCode);
  }

  return (
    <BaseSheet
      sheetRef={sheetRef}
      snapPoints={snapPoints}
      initialSnapIndex={1}
      enableDismissOnClose={false}
      enableGestureClose={false}
      sheetKey={Sheets.ROUTE_LIST}
      onPresent={onPresent}
      onSnap={updateDrawnRoutes}
    >
      <View>
        <SheetHeader
          title="Routes"
          icon={
            <View style={{ flexDirection: 'row', alignContent: 'center' }}>
              {/* Route Planning */}
              <TouchableOpacity
                onPress={() => presentSheet(Sheets.INPUT_ROUTE)}
              >
                <IconPill
                  icon={
                    <FontAwesome6
                      name="diamond-turn-right"
                      size={16}
                      color={theme.text}
                    />
                  }
                  text="Plan Route"
                />
              </TouchableOpacity>

              {/* Settings */}
              <TouchableOpacity
                style={{ marginLeft: 8 }}
                onPress={() => presentSheet(Sheets.SETTINGS)}
              >
                <IconPill
                  icon={
                    <MaterialIcons
                      name="settings"
                      size={16}
                      color={theme.text}
                    />
                  }
                />
              </TouchableOpacity>
            </View>
          }
        />

        <SegmentedControl
          values={routeCategories}
          selectedIndex={routeCategories.indexOf(selectedRouteCategory)}
          style={{ marginHorizontal: 16 }}
          backgroundColor={
            Platform.OS === 'android'
              ? theme.androidSegmentedBackground
              : undefined
          }
          onChange={setCategory}
        />
        <View
          style={{ height: 1, backgroundColor: theme.divider, marginTop: 8 }}
        />
        {/* Status bar: floats above segmented control, anchored to its margins */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: 16,
          marginBottom: 4,
          paddingVertical: 4,
          gap: 8,
          height: 24
        }}>
          <Text style={{ color: theme.subtitle, flex: 1, fontSize: 14 }}>
            {lastUpdatedMs ? `Last updated: ${formatLastUpdated(lastUpdatedMs)}` : 'Last updated: —'}
          </Text>
          {showUpdateSpinner && (
            <ActivityIndicator size="small" color={theme.subtitle} style={{ transform: [{ scale: 0.7 }] }} />
          )}
          {showReloadButton && !showUpdateSpinner && (
            <TouchableOpacity onPress={onRequestedReload}>
              <MaterialIcons name="refresh" size={16} color={theme.subtitle} />
            </TouchableOpacity>
          )}
        </View>


        {!isFavoritesLoading &&
          selectedRouteCategory === 'Favorites' &&
          favorites?.length === 0 &&
          routes?.length !== 0 && (
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <Text style={{ color: theme.text }}>
                You don't have any favorite routes.
              </Text>
            </View>
          )}

        {/* Loading indicatior, only show if no error and either loading or there are no routes */}
        {/* prevents spinner appearing when transitioning from cache to live */}
        {!routeError && (isRoutesLoading && !routes) && (
          <ActivityIndicator style={{ marginTop: 12 }} />
        )}

        {/* Error */}
        {routeError || routeAPIError ? (
          <View style={{ alignItems: 'center', marginTop: 16 }}>
            <Text style={{ color: theme.subtitle }}>
              Error loading routes. Please try again later.
            </Text>
          </View>
        ) : (
          isFavoritesError &&
          selectedRouteCategory === 'Favorites' && (
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <Text style={{ color: theme.subtitle }}>
                Error loading favorites. Please try again later.
              </Text>
            </View>
          )
        )}
      </View>

      <BottomSheetFlatList
        contentContainerStyle={{
          paddingBottom: 35,
          paddingTop: 4,
          marginTop: -6,
          marginLeft: 16,
        }}
        data={filteredRoutes}
        keyExtractor={(route: Route) => route.id}
        renderItem={({ item: route }) => {
          return (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginVertical: 8,
              }}
              onPress={() => selectRoute(route)}
            >
              <BusIcon
                name={route.routeCode}
                color={route.tintColor ?? '#000'}
                style={{ marginRight: 12 }}
              />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text
                    style={{
                      fontWeight: 'bold',
                      fontSize: 20,
                      lineHeight: 28,
                      color: theme.text,
                    }}
                  >
                    {route.name}
                  </Text>
                  {isFavorite(route) && (
                    <FontAwesome
                      name="star"
                      size={16}
                      color={theme.starColor}
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
                {route.directions.length === 2 ? (
                  <View
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Text style={{ color: theme.text }}>
                      {route.directions[0].name}
                    </Text>
                    <MaterialCommunityIcons
                      name="arrow-left-right"
                      size={12}
                      color={theme.text}
                    />
                    <Text style={{ color: theme.text }}>
                      {route.directions[1].name}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: theme.text }}>Campus Circulator</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </BaseSheet>
  );
};

export default memo(RoutesList);
