/**
 * NightWalk Mobile - Report Crime Screen (Tab 4)
 * Allows users to submit a crime report with video evidence (min 7 seconds),
 * crime type selection, description, and auto-detected GPS coordinates.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
    Platform,
    PermissionsAndroid,
} from 'react-native';
import { Camera, Upload, MapPin, FileText, CheckCircle, AlertTriangle, Video } from 'lucide-react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import Config from 'react-native-config';

const API_BASE_URL = (Config.API_BASE_URL || '').replace(/\/+$/, '');

// Crime types matching the backend enum
const CRIME_TYPES = [
    { value: 'abuse', label: 'Abuse', icon: 'ΓÜá' },
    { value: 'arrest', label: 'Arrest', icon: '≡ƒÜö' },
    { value: 'arson', label: 'Arson', icon: '≡ƒöÑ' },
    { value: 'assault', label: 'Assault', icon: '≡ƒæè' },
    { value: 'burglary', label: 'Burglary', icon: '≡ƒÅá' },
    { value: 'explosion', label: 'Explosion', icon: '≡ƒÆÑ' },
    { value: 'fighting', label: 'Fighting', icon: '≡ƒÑè' },
    { value: 'road_accidents', label: 'Road Accident', icon: '≡ƒÜù' },
    { value: 'robbery', label: 'Robbery', icon: '≡ƒÆ░' },
    { value: 'shooting', label: 'Shooting', icon: '≡ƒö½' },
    { value: 'stealing', label: 'Stealing', icon: '≡ƒÅâ' },
    { value: 'vandalism', label: 'Vandalism', icon: '≡ƒö¿' },
] as const;

type CrimeType = typeof CRIME_TYPES[number]['value'];

export default function ReportCrimeScreen() {
    const [selectedCrimeType, setSelectedCrimeType] = useState<CrimeType | null>(null);
    const [description, setDescription] = useState('');
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [videoDuration, setVideoDuration] = useState<number | null>(null);
    const [latitude, setLatitude] = useState<string>('');
    const [longitude, setLongitude] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    // Auto-detect GPS on mount
    useEffect(() => {
        detectLocation();
    }, []);

    const detectLocation = useCallback(async () => {
        setLocationLoading(true);
        try {
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permission Denied', 'Location permission is required for accurate reports.');
                    setLocationLoading(false);
                    return;
                }
            }
            Geolocation.getCurrentPosition(
                position => {
                    setLatitude(position.coords.latitude.toFixed(6));
                    setLongitude(position.coords.longitude.toFixed(6));
                    setLocationLoading(false);
                },
                error => {
                    console.warn('Location error:', error);
                    setLocationLoading(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
            );
        } catch (err) {
            console.warn('Location detection failed:', err);
            setLocationLoading(false);
        }
    }, []);

    const pickVideo = useCallback(async () => {
        try {
            const result = await launchImageLibrary({
                mediaType: 'video',
                videoQuality: 'medium',
                durationLimit: 120,
            });

            if (result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const duration = asset.duration || 0;

                if (duration < 7) {
                    Alert.alert(
                        'Video Too Short',
                        `Your video is ${duration.toFixed(1)}s long. The minimum required length is 7 seconds for proper crime classification analysis.`,
                        [{ text: 'OK' }],
                    );
                    return;
                }

                setVideoUri(asset.uri || null);
                setVideoDuration(duration);
            }
        } catch (err) {
            console.error('Video picker error:', err);
        }
    }, []);

    const recordVideo = useCallback(async () => {
        try {
            if (Platform.OS === 'android') {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permission Denied', 'Camera permission is required.');
                    return;
                }
            }
            const result = await launchCamera({
                mediaType: 'video',
                videoQuality: 'medium',
                durationLimit: 120,
            });

            if (result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                const duration = asset.duration || 0;

                if (duration < 7) {
                    Alert.alert(
                        'Video Too Short',
                        `Your video is ${duration.toFixed(1)}s long. Must be at least 7 seconds.`,
                    );
                    return;
                }

                setVideoUri(asset.uri || null);
                setVideoDuration(duration);
            }
        } catch (err) {
            console.error('Video recording error:', err);
        }
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!selectedCrimeType) {
            Alert.alert('Missing Info', 'Please select a crime type.');
            return;
        }
        if (!videoUri) {
            Alert.alert('Missing Video', 'Please attach a video of at least 7 seconds.');
            return;
        }
        if (!latitude || !longitude) {
            Alert.alert('Missing Location', 'Please ensure your GPS coordinates are set.');
            return;
        }

        setIsSubmitting(true);

        try {
            // For now, submit the report metadata to the API.
            // Video upload to cloud storage would happen here in production.
            const reportData = {
                lat: parseFloat(latitude),
                long: parseFloat(longitude),
                crime_type: selectedCrimeType,
                description: description || undefined,
                evidence_video_url: videoUri, // In production, this would be the uploaded URL
            };

            if (API_BASE_URL) {
                const response = await fetch(`${API_BASE_URL}/reports/crime`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reportData),
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || 'Failed to submit report');
                }
            }

            setIsSuccess(true);
            // Reset form after 3 seconds
            setTimeout(() => {
                setIsSuccess(false);
                setSelectedCrimeType(null);
                setDescription('');
                setVideoUri(null);
                setVideoDuration(null);
            }, 3000);
        } catch (err) {
            Alert.alert(
                'Submission Failed',
                err instanceof Error ? err.message : 'Could not submit the report. Please try again.',
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [selectedCrimeType, videoUri, latitude, longitude, description]);

    // Success state
    if (isSuccess) {
        return (
            <View style={styles.container}>
                <View style={styles.successContainer}>
                    <CheckCircle size={64} color="#22c55e" />
                    <Text style={styles.successTitle}>Report Submitted</Text>
                    <Text style={styles.successSubtitle}>
                        Your report is being processed by our AI classification system.
                        You will be notified once it has been validated.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Report a Crime</Text>
                <Text style={styles.headerSubtitle}>
                    Submit evidence for AI-powered analysis and validation
                </Text>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Video Attachment */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        <Video size={14} color="#00f5ff" /> Video Evidence
                    </Text>
                    <Text style={styles.sectionHint}>Minimum 7 seconds for crime classification</Text>

                    {videoUri ? (
                        <View style={styles.videoAttached}>
                            <CheckCircle size={20} color="#22c55e" />
                            <View style={styles.videoInfo}>
                                <Text style={styles.videoAttachedText}>Video attached</Text>
                                {videoDuration && (
                                    <Text style={styles.videoDuration}>{videoDuration.toFixed(1)}s</Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={() => { setVideoUri(null); setVideoDuration(null); }}>
                                <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.videoButtons}>
                            <TouchableOpacity style={styles.videoButton} onPress={recordVideo}>
                                <Camera size={24} color="#00f5ff" />
                                <Text style={styles.videoButtonText}>Record</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.videoButton} onPress={pickVideo}>
                                <Upload size={24} color="#00f5ff" />
                                <Text style={styles.videoButtonText}>Upload</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Crime Type Selection */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Crime Type</Text>
                    <View style={styles.crimeGrid}>
                        {CRIME_TYPES.map(ct => (
                            <TouchableOpacity
                                key={ct.value}
                                style={[
                                    styles.crimeChip,
                                    selectedCrimeType === ct.value && styles.crimeChipSelected,
                                ]}
                                onPress={() => setSelectedCrimeType(ct.value)}
                            >
                                <Text style={styles.crimeChipIcon}>{ct.icon}</Text>
                                <Text
                                    style={[
                                        styles.crimeChipLabel,
                                        selectedCrimeType === ct.value && styles.crimeChipLabelSelected,
                                    ]}
                                >
                                    {ct.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Description */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        <FileText size={14} color="#00f5ff" /> Description (optional)
                    </Text>
                    <TextInput
                        style={styles.descriptionInput}
                        placeholder="Describe what happened..."
                        placeholderTextColor="#606070"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={3}
                        maxLength={500}
                    />
                    <Text style={styles.charCount}>{description.length}/500</Text>
                </View>

                {/* Location */}
                <View style={styles.section}>
                    <View style={styles.locationHeader}>
                        <Text style={styles.sectionTitle}>
                            <MapPin size={14} color="#00f5ff" /> Location
                        </Text>
                        <TouchableOpacity
                            style={styles.detectButton}
                            onPress={detectLocation}
                            disabled={locationLoading}
                        >
                            {locationLoading ? (
                                <ActivityIndicator size="small" color="#00f5ff" />
                            ) : (
                                <Text style={styles.detectButtonText}>Auto-detect GPS</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                    <View style={styles.coordsRow}>
                        <View style={styles.coordInput}>
                            <Text style={styles.coordLabel}>Latitude</Text>
                            <TextInput
                                style={styles.input}
                                value={latitude}
                                onChangeText={setLatitude}
                                keyboardType="numeric"
                                placeholder="4.6480"
                                placeholderTextColor="#606070"
                            />
                        </View>
                        <View style={styles.coordInput}>
                            <Text style={styles.coordLabel}>Longitude</Text>
                            <TextInput
                                style={styles.input}
                                value={longitude}
                                onChangeText={setLongitude}
                                keyboardType="numeric"
                                placeholder="101.1112"
                                placeholderTextColor="#606070"
                            />
                        </View>
                    </View>
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        (!selectedCrimeType || !videoUri || !latitude || !longitude) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={isSubmitting || !selectedCrimeType || !videoUri || !latitude || !longitude}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <AlertTriangle size={18} color="#fff" />
                            <Text style={styles.submitButtonText}>Submit Crime Report</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Disclaimer */}
                <Text style={styles.disclaimer}>
                    Your report will be analyzed using VideoMAE crime classification and Gemini AI.
                    False reports may lead to account suspension.
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020204',
    },
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 1,
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#606070',
        fontFamily: 'monospace',
        marginTop: 4,
        letterSpacing: 0.5,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 120,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#00f5ff',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        fontFamily: 'monospace',
    },
    sectionHint: {
        fontSize: 11,
        color: '#606070',
        marginBottom: 10,
        fontFamily: 'monospace',
    },
    videoButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    videoButton: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,245,255,0.2)',
        borderStyle: 'dashed',
        backgroundColor: 'rgba(0,245,255,0.03)',
    },
    videoButtonText: {
        marginTop: 8,
        color: '#00f5ff',
        fontSize: 12,
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    videoAttached: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: 10,
        backgroundColor: 'rgba(34,197,94,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(34,197,94,0.2)',
    },
    videoInfo: {
        flex: 1,
    },
    videoAttachedText: {
        color: '#22c55e',
        fontSize: 13,
        fontWeight: '600',
    },
    videoDuration: {
        color: '#606070',
        fontSize: 11,
        fontFamily: 'monospace',
    },
    removeText: {
        color: '#ff0040',
        fontSize: 12,
        fontWeight: '600',
    },
    crimeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    crimeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    crimeChipSelected: {
        borderColor: 'rgba(168,85,247,0.6)',
        backgroundColor: 'rgba(168,85,247,0.1)',
    },
    crimeChipIcon: {
        fontSize: 14,
    },
    crimeChipLabel: {
        fontSize: 12,
        color: '#888',
        fontFamily: 'monospace',
    },
    crimeChipLabelSelected: {
        color: '#a855f7',
        fontWeight: '600',
    },
    descriptionInput: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 14,
        color: '#fff',
        fontSize: 14,
        minHeight: 80,
        textAlignVertical: 'top',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    charCount: {
        textAlign: 'right',
        fontSize: 10,
        color: '#606070',
        marginTop: 4,
        fontFamily: 'monospace',
    },
    locationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    detectButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(0,245,255,0.3)',
        backgroundColor: 'rgba(0,245,255,0.05)',
    },
    detectButtonText: {
        fontSize: 10,
        color: '#00f5ff',
        fontFamily: 'monospace',
        fontWeight: '600',
    },
    coordsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    coordInput: {
        flex: 1,
    },
    coordLabel: {
        fontSize: 10,
        color: '#606070',
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    input: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        fontFamily: 'monospace',
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 12,
        backgroundColor: '#a855f7',
        marginTop: 8,
    },
    submitButtonDisabled: {
        opacity: 0.4,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    disclaimer: {
        fontSize: 10,
        color: '#606070',
        textAlign: 'center',
        marginTop: 16,
        lineHeight: 16,
        fontFamily: 'monospace',
    },
    successContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    successTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#22c55e',
        marginTop: 20,
    },
    successSubtitle: {
        fontSize: 13,
        color: '#606070',
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 20,
        fontFamily: 'monospace',
    },
});
