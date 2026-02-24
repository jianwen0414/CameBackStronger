import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';

interface VolumetricMistProps {
    xPixel: number;
    yPixel: number;
    distance: number;
    color: string;
}

const PARTICLE_COUNT = 8;
const BASE_W = 120;
const BASE_H = 120;

const getRandomDuration = (min: number, max: number) => Math.random() * (max - min) + min;

const Particle = ({ color, index }: { color: string, index: number }) => {
    // Pure native driver values
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.8 + Math.random() * 0.4)).current;

    // We cannot natively animate layout opacity alongside hardware transforms efficiently inside some RN versions 
    // unless opacity is separated. But RN allows opacity in Native Driver.
    const opacity = useRef(new Animated.Value(0.3 + Math.random() * 0.4)).current;

    useEffect(() => {
        const driftX = 30 + Math.random() * 40;
        const driftY = 20 + Math.random() * 30;

        let timeoutY: ReturnType<typeof setTimeout>;
        let timeoutScale: ReturnType<typeof setTimeout>;

        // X sway
        Animated.loop(
            Animated.sequence([
                Animated.timing(translateX, { toValue: -driftX, duration: getRandomDuration(3000, 5000), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(translateX, { toValue: driftX, duration: getRandomDuration(3000, 5000), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();

        // Y sway (offset by random delay conceptually)
        timeoutY = setTimeout(() => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(translateY, { toValue: -driftY, duration: getRandomDuration(2500, 4500), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(translateY, { toValue: driftY, duration: getRandomDuration(2500, 4500), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            ).start();
        }, index * 200 + 500);

        // Breathing Scale
        timeoutScale = setTimeout(() => {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(scale, { toValue: 1.3, duration: getRandomDuration(2000, 4000), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                    Animated.timing(scale, { toValue: 0.8, duration: getRandomDuration(2000, 4000), easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                ])
            ).start();
        }, index * 200);

        return () => {
            clearTimeout(timeoutY);
            clearTimeout(timeoutScale);
        };
    }, [translateX, translateY, scale, index]);

    // Initial scatter
    const scatterX = (Math.random() - 0.5) * 60;
    const scatterY = (Math.random() - 0.5) * 60;

    return (
        <Animated.View
            style={[
                styles.particle,
                {
                    backgroundColor: color,
                    left: scatterX,
                    top: scatterY,
                    opacity: opacity,
                    transform: [
                        { translateX },
                        { translateY },
                        { scale }
                    ]
                }
            ]}
        />
    );
};

export default function VolumetricMist({ xPixel, yPixel, distance, color }: VolumetricMistProps) {
    // Physical depth scale factor based on distance.
    const depthScale = Math.max(0.1, Math.min(3.0, 15 / Math.max(1, distance)));

    // Optional visual optimization: fewer particles at far distances to save battery since they overlap heavily anyway
    const activeParticles = distance > 100 ? 4 : PARTICLE_COUNT;

    return (
        <View
            style={[
                styles.anchor,
                {
                    left: xPixel - (BASE_W / 2),
                    top: yPixel - (BASE_H / 2),
                    transform: [{ scale: depthScale }],
                    zIndex: Math.round(1000 / distance)
                }
            ]}
        >
            {Array.from({ length: activeParticles }).map((_, i) => (
                <Particle key={i} index={i} color={color} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    anchor: {
        position: 'absolute',
        width: BASE_W,
        height: BASE_H,
        justifyContent: 'center',
        alignItems: 'center',
    },
    particle: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        shadowColor: '#FFF',
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 10,
        // Using standard CSS filter on latest RN, fallback is shadows above
        // @ts-ignore
        filter: 'blur(20px)'
    }
});
