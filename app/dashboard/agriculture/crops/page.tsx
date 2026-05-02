'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CloudRain, Sun, Droplets, ArrowRight } from 'lucide-react';

const CROP_CALENDAR = [
    {
        season: 'Kharif',
        months: 'June - October',
        crops: [
            { name: 'Rice (Paddy)', status: 'Harvesting', progress: 90, icon: Droplets },
            { name: 'Maize', status: 'Growing', progress: 45, icon: Sun },
            { name: 'Cotton', status: 'Flowering', progress: 60, icon: CloudRain }
        ]
    },
    {
        season: 'Rabi',
        months: 'October - March',
        crops: [
            { name: 'Wheat', status: 'Sowing', progress: 10, icon: Sun },
            { name: 'Mustard', status: 'Pre-sowing', progress: 0, icon: Sun }
        ]
    }
];

export default function CropCalendarPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Crop Calendar & Advisory</h1>
                    <p className="text-muted-foreground">Monitor crop cycles and seasonal planning.</p>
                </div>
                <Button>Add Crop Plan</Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {CROP_CALENDAR.map((season, i) => (
                    <Card key={i}>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-xl">{season.season} Season</CardTitle>
                                <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
                                    {season.months}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {season.crops.map((crop, j) => (
                                <div key={j} className="space-y-2">
                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <div className="flex items-center gap-2">
                                            <crop.icon className="w-4 h-4 text-muted-foreground" />
                                            {crop.name}
                                        </div>
                                        <span className="text-muted-foreground">{crop.status}</span>
                                    </div>
                                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500 rounded-full"
                                            style={{ width: `${crop.progress}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            <Button variant="ghost" className="w-full mt-2 group text-muted-foreground hover:text-primary">
                                View Detailed Advisory <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </CardContent>
                    </Card>
                ))}

                <Card className="md:col-span-2 border-l-4 border-l-blue-500 bg-blue-50/50">
                    <CardContent className="p-6 flex items-start gap-4">
                        <CloudRain className="w-8 h-8 text-blue-500 mt-1" />
                        <div>
                            <h3 className="font-semibold text-lg">Weather Alert: Local Advisory</h3>
                            <p className="text-muted-foreground mb-4">
                                Heavy rainfall expected in next 3 days. Farmers are advised to drain excess water from Rice fields and delay fertilizer application for Cotton.
                            </p>
                            <Button variant="outline" size="sm">View Forecast</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
