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
    SafeAreaView,
    Image,
} from 'react-native';
import {
    Camera, Upload, MapPin, FileText, CheckCircle,
    AlertTriangle, Video, ChevronRight, ArrowLeft,
    ShieldAlert, Flame, Home, Bomb, Car, Crosshair,
    Hammer, AlertCircle, Circle, CheckCircle2
} from 'lucide-react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import Geolocation from '@react-native-community/geolocation';
import Config from 'react-native-config';
import { supabase } from '../lib/supabase';

const API_BASE_URL = (Config.API_BASE_URL || '').replace(/\/+$/, '');

// Updated Crime Types using standard Lucide Icons (No Emojis)
const CRIME_TYPES = [
    { value: 'abuse', label: 'Abuse', Icon: ShieldAlert },
    { value: 'arrest', label: 'Arrest', Icon: ShieldAlert },
    { value: 'arson', label: 'Arson', Icon: Flame },
    { value: 'assault', label: 'Assault', Icon: ShieldAlert },
    { value: 'burglary', label: 'Burglary', Icon: Home },
    { value: 'explosion', label: 'Explosion', Icon: Bomb },
    { value: 'fighting', label: 'Fighting', Icon: AlertCircle },
    { value: 'road_accidents', label: 'Road Accident', Icon: Car },
    { value: 'robbery', label: 'Robbery', Icon: AlertCircle },
    { value: 'shooting', label: 'Shooting', Icon: Crosshair },
    { value: 'stealing', label: 'Stealing', Icon: AlertCircle },
    { value: 'vandalism', label: 'Vandalism', Icon: Hammer },
] as const;

type CrimeType = typeof CRIME_TYPES[number]['value'];
type Step = 'HUB' | 'DETAILS' | 'LOCATION_AND_EVIDENCE';

export default function ReportCrimeScreen() {
    // UI State Management for Multi-Step Flow
    const [currentStep, setCurrentStep] = useState<Step>('HUB');

    // Form Data State
    const [selectedCrimeType, setSelectedCrimeType] = useState<CrimeType | null>(null);
    const [description, setDescription] = useState('');
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [videoDuration, setVideoDuration] = useState<number | null>(null);
    const [latitude, setLatitude] = useState<string>('');
    const [longitude, setLongitude] = useState<string>('');

    // Submission & Loading State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    // Auto-detect GPS on mount if not already loaded
    useEffect(() => {
        if (!latitude || !longitude) {
            detectLocation();
        }
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
                    console.warn('Location error (high accuracy):', error);
                    // Fallback to low accuracy on timeout/failure
                    Geolocation.getCurrentPosition(
                        pos => {
                            setLatitude(pos.coords.latitude.toFixed(6));
                            setLongitude(pos.coords.longitude.toFixed(6));
                            setLocationLoading(false);
                        },
                        err => {
                            console.warn('Location error (low accuracy):', err);
                            setLocationLoading(false);
                            Alert.alert('GPS Timeout', 'Could not lock onto your location. Please enter your coordinates manually.');
                        },
                        { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
                    );
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
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
        if (!selectedCrimeType || !videoUri || !latitude || !longitude) {
            Alert.alert('Missing Info', 'Please ensure all steps are completed.');
            return;
        }

        setIsSubmitting(true);

        try {
            let finalVideoUrl = videoUri;

            // Upload the video to Supabase Storage if it's a local file
            if (videoUri.startsWith('file://') || videoUri.startsWith('content://')) {
                const ext = videoUri.split('.').pop() || 'mp4';
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

                // Using FormData which is the most reliable way on React Native 
                // for uploading files pointing to a device URI
                const formData = new FormData();
                formData.append('file', {
                    uri: videoUri,
                    name: fileName,
                    type: `video/${ext === 'mov' ? 'quicktime' : 'mp4'}`,
                } as any);

                // We now upload the video directly to our backend endpoint.
                // The backend uses the Supabase service key to bypass the strict RLS 
                // policies on the `evidence-videos` bucket.
                const uploadResponse = await fetch(`${API_BASE_URL}/reports/upload`, {
                    method: 'POST',
                    body: formData,
                });

                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    throw new Error('Failed to upload video to backend: ' + errorText);
                }

                const responseData = await uploadResponse.json();
                finalVideoUrl = responseData.evidence_video_url;
            }

            const reportData = {
                lat: parseFloat(latitude),
                long: parseFloat(longitude),
                crime_type: selectedCrimeType,
                description: description || undefined,
                evidence_video_url: finalVideoUrl,
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
            setTimeout(() => {
                setIsSuccess(false);
                setSelectedCrimeType(null);
                setDescription('');
                setVideoUri(null);
                setVideoDuration(null);
                setCurrentStep('HUB');
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

    // ==== SUB-RENDERERS ==== //

    const HubStepRow = ({ label, isComplete, onPress, isLast }: any) => (
        <TouchableOpacity style={[styles.hubStepRow, isLast && styles.hubStepRowLast]} onPress={onPress}>
            <Text style={styles.hubStepLabel}>{label}</Text>
            {isComplete ? (
                <CheckCircle2 size={24} color="#FFFFFF" />
            ) : (
                <Circle size={24} color="#333333" />
            )}
        </TouchableOpacity>
    );

    const renderHub = () => {
        const isComplete = selectedCrimeType && latitude && longitude && videoUri;

        return (
            <View style={styles.stepContainer}>
                {!isComplete ? (
                    <View style={styles.hubImageWrapper}>
                        <Image
                            source={require('../../ReportCrime.png')}
                            style={styles.hubHeaderImage}
                            resizeMode="cover"
                        />
                    </View>
                ) : (
                    <>
                        <View style={styles.hubHeaderContainer}>
                            <Text style={styles.hubTitle}>Review Summary</Text>
                            <Text style={styles.hubSubtitle}>
                                Please double check your details before submitting to the AI Validation Pipeline.
                            </Text>
                        </View>
                        <View style={styles.reviewSummaryCard}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Type</Text>
                                <Text style={styles.summaryValue}>{CRIME_TYPES.find(c => c.value === selectedCrimeType)?.label}</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Location</Text>
                                <Text style={styles.summaryValue}>{latitude}, {longitude}</Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Evidence</Text>
                                <Text style={styles.summaryValue}>Video Attached ({videoDuration?.toFixed(1)}s)</Text>
                            </View>
                        </View>
                    </>
                )}

                <ScrollView
                    contentContainerStyle={[styles.stepList, { paddingBottom: 100 }]}
                    bounces={false}
                >
                    <HubStepRow
                        label="Incident Details"
                        isComplete={!!selectedCrimeType}
                        onPress={() => setCurrentStep('DETAILS')}
                    />
                    <HubStepRow
                        label="Location & Evidence"
                        isComplete={!!latitude && !!longitude && !!videoUri}
                        onPress={() => setCurrentStep('LOCATION_AND_EVIDENCE')}
                        isLast
                    />
                </ScrollView>

                <SafeAreaView style={styles.bottomSafeArea}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={isComplete ? handleSubmit : () => setCurrentStep('DETAILS')}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.primaryButtonText}>
                                {isComplete ? 'Submit Report' : 'Start'}
                            </Text>
                        )}
                    </TouchableOpacity>
                </SafeAreaView>
            </View>
        );
    };

    const renderDetails = () => (
        <View style={styles.stepContainer}>
            <View style={styles.stepHeader}>
                <TouchableOpacity onPress={() => setCurrentStep('HUB')} style={styles.backButton}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.stepTitle}>Incident Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.card}>
                    <Text style={styles.cardHeader}>Select Crime Type</Text>
                    <View style={styles.grid}>
                        {CRIME_TYPES.map(ct => {
                            const isSelected = selectedCrimeType === ct.value;
                            const Icon = ct.Icon;
                            return (
                                <TouchableOpacity
                                    key={ct.value}
                                    style={[styles.gridItem, isSelected && styles.gridItemSelected]}
                                    onPress={() => setSelectedCrimeType(ct.value)}
                                >
                                    <Icon size={24} color={isSelected ? '#fff' : '#888'} />
                                    <Text style={[styles.gridItemLabel, isSelected && styles.gridItemLabelSelected]}>
                                        {ct.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardHeader}>Description (Optional)</Text>
                    <TextInput
                        style={styles.textArea}
                        placeholder="Describe what happened..."
                        placeholderTextColor="#666"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={4}
                        maxLength={500}
                    />
                    <Text style={styles.charCount}>{description.length}/500</Text>
                </View>
            </ScrollView>
            <SafeAreaView style={styles.bottomSafeArea}>
                <TouchableOpacity
                    style={[styles.primaryButton, !selectedCrimeType && styles.primaryButtonDisabled]}
                    onPress={() => setCurrentStep('LOCATION_AND_EVIDENCE')}
                    disabled={!selectedCrimeType}
                >
                    <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
            </SafeAreaView>
        </View>
    );

    const renderLocationAndEvidence = () => {
        const isLocationComplete = !!latitude && !!longitude;

        return (
            <View style={styles.stepContainer}>
                <View style={styles.stepHeader}>
                    <TouchableOpacity onPress={() => setCurrentStep('HUB')} style={styles.backButton}>
                        <ArrowLeft size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.stepTitle}>Location & Evidence</Text>
                    <View style={{ width: 24 }} />
                </View>

                <ScrollView style={styles.scrollView}>
                    {/* Location Section */}
                    <View style={styles.dashboardCard}>
                        <View style={styles.dashboardHeader}>
                            <Text style={styles.dashboardHeaderTitle}>COORDINATES</Text>
                            {isLocationComplete && <CheckCircle2 size={16} color="#22c55e" />}
                        </View>

                        <View style={styles.coordinatesDisplay}>
                            <View style={styles.coordinateItem}>
                                <TextInput
                                    style={styles.coordinateInput}
                                    value={latitude}
                                    onChangeText={setLatitude}
                                    keyboardType="numeric"
                                    placeholder="---"
                                    placeholderTextColor="#444"
                                />
                                <Text style={styles.coordinateLabel}>Latitude</Text>
                            </View>
                            <View style={styles.coordinateDivider} />
                            <View style={styles.coordinateItem}>
                                <TextInput
                                    style={styles.coordinateInput}
                                    value={longitude}
                                    onChangeText={setLongitude}
                                    keyboardType="numeric"
                                    placeholder="---"
                                    placeholderTextColor="#444"
                                />
                                <Text style={styles.coordinateLabel}>Longitude</Text>
                            </View>
                        </View>

                        <View style={styles.actionCircleContainer}>
                            <TouchableOpacity
                                style={styles.actionCircle}
                                onPress={detectLocation}
                                disabled={locationLoading}
                            >
                                {locationLoading ? (
                                    <ActivityIndicator size="large" color="#fff" />
                                ) : (
                                    <MapPin size={32} color="#fff" />
                                )}
                            </TouchableOpacity>
                            <Text style={styles.actionLabel}>TAP TO AUTO-DETECT GPS</Text>
                        </View>
                    </View>

                    {/* Evidence Section - Grayed out if location is not complete */}
                    <View style={[styles.dashboardCard, !isLocationComplete && styles.dashboardCardDisabled]}>
                        <View style={styles.dashboardHeader}>
                            <Text style={styles.dashboardHeaderTitle}>VIDEO EVIDENCE</Text>
                            {videoUri && <CheckCircle2 size={16} color="#22c55e" />}
                        </View>

                        <Text style={styles.dashboardSubtitle}>
                            Your submission needs to be verified by VideoMAE. Minimum 7 seconds.
                        </Text>

                        {videoUri ? (
                            <View style={styles.videoAttachedCard}>
                                <CheckCircle size={48} color="#FFFFFF" />
                                <Text style={styles.videoAttachedTitle}>Video Attached</Text>
                                {videoDuration && (
                                    <Text style={styles.videoAttachedSubtitle}>{videoDuration.toFixed(1)}s duration</Text>
                                )}
                                <TouchableOpacity
                                    style={styles.secondaryButton}
                                    onPress={() => { setVideoUri(null); setVideoDuration(null); }}
                                    disabled={!isLocationComplete}
                                >
                                    <Text style={styles.secondaryButtonText}>Remove</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.evidenceButtons}>
                                <TouchableOpacity
                                    style={styles.evidenceCircle}
                                    onPress={recordVideo}
                                    disabled={!isLocationComplete}
                                >
                                    <View style={styles.actionCircle}>
                                        <Camera size={32} color={isLocationComplete ? "#fff" : "#444"} />
                                    </View>
                                    <Text style={[styles.evidenceCircleText, !isLocationComplete && { color: '#444' }]}>RECORD</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.evidenceCircle}
                                    onPress={pickVideo}
                                    disabled={!isLocationComplete}
                                >
                                    <View style={styles.actionCircle}>
                                        <Upload size={32} color={isLocationComplete ? "#fff" : "#444"} />
                                    </View>
                                    <Text style={[styles.evidenceCircleText, !isLocationComplete && { color: '#444' }]}>UPLOAD</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {!isLocationComplete && (
                            <View style={styles.disabledOverlay} />
                        )}
                    </View>
                </ScrollView>

                <SafeAreaView style={styles.bottomSafeArea}>
                    <TouchableOpacity
                        style={[styles.primaryButton, (!isLocationComplete || !videoUri) && styles.primaryButtonDisabled]}
                        onPress={() => setCurrentStep('HUB')}
                        disabled={!isLocationComplete || !videoUri}
                    >
                        <Text style={styles.primaryButtonText}>Finish Setup</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            </View>
        );
    };

    // ==== MAIN RENDER ==== //

    if (isSuccess) {
        return (
            <View style={styles.container}>
                <View style={styles.successContainer}>
                    <CheckCircle size={64} color="#FFFFFF" />
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
            {currentStep === 'HUB' && renderHub()}
            {currentStep === 'DETAILS' && renderDetails()}
            {currentStep === 'LOCATION_AND_EVIDENCE' && renderLocationAndEvidence()}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    stepContainer: {
        flex: 1,
    },
    hubHeaderContainer: {
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    hubTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    hubSubtitle: {
        fontSize: 16,
        color: '#888888',
        lineHeight: 24,
    },
    hubCard: {
        backgroundColor: '#1C1C1E',
        marginHorizontal: 24,
        padding: 24,
        borderRadius: 20,
        height: 160,
        justifyContent: 'center',
        marginBottom: 24,
    },
    hubCardTime: {
        color: '#888888',
        fontSize: 14,
        marginBottom: 8,
    },
    hubImageWrapper: {
        width: '100%',
        height: 250,
        marginBottom: 24,
    },
    hubHeaderImage: {
        width: '100%',
        height: '100%',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    hubCardTitle: {
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '600',
        letterSpacing: -0.5,
    },
    stepList: {
        paddingHorizontal: 24,
    },
    hubStepRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#222222',
    },
    hubStepRowLast: {
        borderBottomWidth: 0,
    },
    hubStepLabel: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '500',
    },
    primaryButton: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 24,
        paddingVertical: 18,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 'auto',
        marginBottom: Platform.OS === 'ios' ? 0 : 24,
    },
    primaryButtonDisabled: {
        backgroundColor: '#333333',
    },
    primaryButtonText: {
        color: '#000000',
        fontSize: 17,
        fontWeight: '600',
    },
    stepHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    backButton: {
        padding: 8,
    },
    stepTitle: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: 20,
    },
    bottomSafeArea: {
        backgroundColor: '#000000',
        paddingBottom: Platform.OS === 'ios' ? 0 : 24,
        paddingTop: 12,
    },
    card: {
        backgroundColor: '#111111',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#222222',
    },
    cardHeader: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 16,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'space-between',
    },
    gridItem: {
        width: '48%',
        backgroundColor: '#1A1A1A',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    gridItemSelected: {
        borderColor: '#FFFFFF',
        backgroundColor: '#2A2A2A',
    },
    gridItemLabel: {
        color: '#888888',
        fontSize: 14,
        marginTop: 12,
        fontWeight: '500',
    },
    gridItemLabelSelected: {
        color: '#FFFFFF',
    },
    textArea: {
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        padding: 16,
        color: '#FFFFFF',
        fontSize: 16,
        minHeight: 120,
        textAlignVertical: 'top',
    },
    charCount: {
        color: '#666666',
        fontSize: 12,
        textAlign: 'right',
        marginTop: 8,
    },
    dashboardCard: {
        backgroundColor: '#111111',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: '#222222',
        marginBottom: 20,
    },
    dashboardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    dashboardHeaderTitle: {
        color: '#888888',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    dashboardSubtitle: {
        color: '#CCCCCC',
        fontSize: 18,
        lineHeight: 26,
        marginBottom: 24,
    },
    coordinatesDisplay: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 40,
    },
    coordinateItem: {
        alignItems: 'center',
        flex: 1,
    },
    coordinateInput: {
        color: '#8B93FA',
        fontSize: 24,
        fontWeight: '500',
        marginBottom: 8,
        textAlign: 'center',
    },
    coordinateLabel: {
        color: '#666666',
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    coordinateDivider: {
        width: 1,
        height: 60,
        backgroundColor: '#333333',
        marginHorizontal: 16,
    },
    actionCircleContainer: {
        alignItems: 'center',
        marginTop: 20,
    },
    actionCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#1A1A1A',
        borderWidth: 1,
        borderColor: '#333333',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    actionLabel: {
        color: '#666666',
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '600',
    },
    evidenceButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 32,
        marginTop: 20,
        paddingBottom: 20,
    },
    evidenceCircle: {
        alignItems: 'center',
    },
    evidenceCircleText: {
        color: '#666666',
        fontSize: 11,
        letterSpacing: 1,
        fontWeight: '600',
        marginTop: 12,
    },
    videoAttachedCard: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    videoAttachedTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    videoAttachedSubtitle: {
        color: '#888888',
        fontSize: 14,
        marginTop: 4,
    },
    secondaryButton: {
        marginTop: 24,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        backgroundColor: '#2A2A2A',
    },
    secondaryButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    reviewCard: {
        backgroundColor: '#111111',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: '#222222',
        marginBottom: 20,
    },
    reviewSectionTitle: {
        color: '#666666',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    reviewValue: {
        color: '#FFFFFF',
        fontSize: 16,
        marginBottom: 24,
        lineHeight: 24,
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
        color: '#FFFFFF',
        marginTop: 20,
        marginBottom: 10,
    },
    successSubtitle: {
        fontSize: 15,
        color: '#888888',
        textAlign: 'center',
        lineHeight: 24,
    },
    reviewSummaryCard: {
        backgroundColor: '#1C1C1E',
        marginHorizontal: 24,
        padding: 24,
        borderRadius: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#333',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#2A2A2A',
    },
    summaryLabel: {
        color: '#888888',
        fontSize: 14,
    },
    summaryValue: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '500',
    },
    dashboardCardDisabled: {
        opacity: 0.5,
    },
    disabledOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.1)',
        zIndex: 10,
    },
});
