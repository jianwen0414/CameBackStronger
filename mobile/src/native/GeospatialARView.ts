import { requireNativeComponent, ViewProps } from 'react-native';

interface GeospatialARViewProps extends ViewProps {
}

export const GeospatialARView = requireNativeComponent<GeospatialARViewProps>('GeospatialARView');
