import { useMemo, useState } from 'react';
import type { VestingSchedule } from '../../types/index.js';

const MINUTES_PER_BLOCK = 10;
const MS_PER_BLOCK = MINUTES_PER_BLOCK * 60 * 1000;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

type EventKind = 'cliff' | 'step' | 'full';

interface VestingEvent {
    readonly date: Date;
    readonly scheduleId: bigint;
    readonly kind: EventKind;
    readonly label: string;
    readonly detail: string;
}

interface VestingCalendarProps {
    readonly schedules: VestingSchedule[];
    readonly currentBlock: bigint;
}

function blockToDate(targetBlock: bigint, currentBlock: bigint): Date {
    const diff = Number(targetBlock - currentBlock);
    return new Date(Date.now() + diff * MS_PER_BLOCK);
}

function dateKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function shortAddr(addr: string): string {
    if (addr.length <= 14) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function buildEvents(schedules: VestingSchedule[], currentBlock: bigint): VestingEvent[] {
    const events: VestingEvent[] = [];

    for (const s of schedules) {
        if (s.revoked) continue;

        const cliffEnd = s.startBlock + s.cliffBlocks;
        const fullVest = s.startBlock + s.durationBlocks;
        const benefShort = shortAddr(s.beneficiary);

        // Cliff end event
        if (s.cliffBlocks > 0n && cliffEnd > currentBlock) {
            events.push({
                date: blockToDate(cliffEnd, currentBlock),
                scheduleId: s.id,
                kind: 'cliff',
                label: `Cliff ends`,
                detail: `Schedule #${s.id.toString()} — ${benefShort} — tokens start unlocking`,
            });
        }

        // Full vesting event
        if (fullVest > currentBlock) {
            events.push({
                date: blockToDate(fullVest, currentBlock),
                scheduleId: s.id,
                kind: 'full',
                label: `Fully vested`,
                detail: `Schedule #${s.id.toString()} — ${benefShort} — 100% unlocked`,
            });
        }

        // Stepped: step unlock events
        if (s.vestingType === 1 && s.stepsCount > 0) {
            const stepDuration = s.durationBlocks / BigInt(s.stepsCount);
            for (let i = 1; i < s.stepsCount; i++) {
                const stepBlock = s.startBlock + stepDuration * BigInt(i);
                if (stepBlock > currentBlock) {
                    const pct = Math.round((i / s.stepsCount) * 100);
                    events.push({
                        date: blockToDate(stepBlock, currentBlock),
                        scheduleId: s.id,
                        kind: 'step',
                        label: `Step ${i}/${s.stepsCount}`,
                        detail: `Schedule #${s.id.toString()} — ${benefShort} — ${pct}% unlocked`,
                    });
                }
            }
        }
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getMonthDays(year: number, month: number): Date[] {
    const days: Date[] = [];
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
}

const KIND_ICONS: Record<EventKind, string> = {
    cliff: '\u23F3',  // hourglass
    step: '\uD83D\uDD13',  // unlock
    full: '\u2705',  // check
};

const KIND_LABELS: Record<EventKind, string> = {
    cliff: 'Cliff End',
    step: 'Step Unlock',
    full: 'Fully Vested',
};

export function VestingCalendar({ schedules, currentBlock }: VestingCalendarProps): React.JSX.Element {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [selectedDay, setSelectedDay] = useState<string | null>(null);

    const events = useMemo(() => buildEvents(schedules, currentBlock), [schedules, currentBlock]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, VestingEvent[]>();
        for (const ev of events) {
            const key = dateKey(ev.date);
            const arr = map.get(key);
            if (arr !== undefined) {
                arr.push(ev);
            } else {
                map.set(key, [ev]);
            }
        }
        return map;
    }, [events]);

    const days = useMemo(() => getMonthDays(year, month), [year, month]);

    const firstDayOffset = useMemo(() => {
        const dow = days[0]?.getDay() ?? 1;
        return dow === 0 ? 6 : dow - 1;
    }, [days]);

    const prevMonth = (): void => {
        if (month === 0) { setMonth(11); setYear((y) => y - 1); }
        else { setMonth((m) => m - 1); }
        setSelectedDay(null);
    };

    const nextMonth = (): void => {
        if (month === 11) { setMonth(0); setYear((y) => y + 1); }
        else { setMonth((m) => m + 1); }
        setSelectedDay(null);
    };

    const todayKey = dateKey(now);
    const selectedEvents = selectedDay !== null ? (eventsByDay.get(selectedDay) ?? []) : [];

    // Count upcoming events this month for the summary
    const monthEventCount = useMemo(() => {
        let count = 0;
        for (const day of days) {
            const evs = eventsByDay.get(dateKey(day));
            if (evs !== undefined) count += evs.length;
        }
        return count;
    }, [days, eventsByDay]);

    return (
        <section id="vest-calendar" className="vest-calendar-section">
            <div className="vest-calendar-panel">
                <div className="vest-calendar__header">
                    <h3 className="vest-calendar__title">Vesting Calendar</h3>
                    {monthEventCount > 0 && (
                        <span className="vest-calendar__badge">{monthEventCount} event{monthEventCount > 1 ? 's' : ''}</span>
                    )}
                </div>

                <div className="vest-calendar__nav">
                    <button className="vest-calendar__nav-btn" onClick={prevMonth}>&lsaquo;</button>
                    <span className="vest-calendar__month">{MONTH_NAMES[month]} {year}</span>
                    <button className="vest-calendar__nav-btn" onClick={nextMonth}>&rsaquo;</button>
                </div>

                <div className="vest-calendar__grid">
                    {WEEKDAYS.map((d) => (
                        <div key={d} className="vest-calendar__weekday">{d}</div>
                    ))}

                    {Array.from({ length: firstDayOffset }, (_, i) => (
                        <div key={`empty-${i}`} className="vest-calendar__cell vest-calendar__cell--empty" />
                    ))}

                    {days.map((day) => {
                        const key = dateKey(day);
                        const dayEvents = eventsByDay.get(key);
                        const isToday = key === todayKey;
                        const isSelected = key === selectedDay;
                        const cliffCount = dayEvents?.filter((e) => e.kind === 'cliff').length ?? 0;
                        const stepCount = dayEvents?.filter((e) => e.kind === 'step').length ?? 0;
                        const fullCount = dayEvents?.filter((e) => e.kind === 'full').length ?? 0;

                        return (
                            <button
                                key={key}
                                className={
                                    'vest-calendar__cell' +
                                    (isToday ? ' vest-calendar__cell--today' : '') +
                                    (isSelected ? ' vest-calendar__cell--selected' : '') +
                                    (dayEvents !== undefined ? ' vest-calendar__cell--has-events' : '')
                                }
                                onClick={() => setSelectedDay(isSelected ? null : key)}
                            >
                                <span className="vest-calendar__day-num">{day.getDate()}</span>
                                {dayEvents !== undefined && (
                                    <div className="vest-calendar__pills">
                                        {cliffCount > 0 && (
                                            <span className="vest-calendar__pill vest-calendar__pill--cliff">
                                                {cliffCount} cliff
                                            </span>
                                        )}
                                        {stepCount > 0 && (
                                            <span className="vest-calendar__pill vest-calendar__pill--step">
                                                {stepCount} step
                                            </span>
                                        )}
                                        {fullCount > 0 && (
                                            <span className="vest-calendar__pill vest-calendar__pill--full">
                                                {fullCount} done
                                            </span>
                                        )}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Legend */}
                <div className="vest-calendar__legend">
                    <span className="vest-calendar__legend-item">
                        <span className="vest-calendar__legend-dot vest-calendar__legend-dot--cliff" />
                        Cliff End
                    </span>
                    <span className="vest-calendar__legend-item">
                        <span className="vest-calendar__legend-dot vest-calendar__legend-dot--step" />
                        Step Unlock
                    </span>
                    <span className="vest-calendar__legend-item">
                        <span className="vest-calendar__legend-dot vest-calendar__legend-dot--full" />
                        Fully Vested
                    </span>
                </div>

                {/* Selected day details */}
                {selectedDay !== null && selectedEvents.length > 0 && (
                    <div className="vest-calendar__detail">
                        <h4 className="vest-calendar__detail-title">
                            {selectedEvents[0]?.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </h4>
                        <div className="vest-calendar__event-list">
                            {selectedEvents.map((ev, i) => (
                                <div key={i} className={`vest-calendar__event vest-calendar__event--${ev.kind}`}>
                                    <span className="vest-calendar__event-icon">{KIND_ICONS[ev.kind]}</span>
                                    <div className="vest-calendar__event-content">
                                        <span className="vest-calendar__event-kind">{KIND_LABELS[ev.kind]}</span>
                                        <span className="vest-calendar__event-label">{ev.label}</span>
                                        <span className="vest-calendar__event-detail">{ev.detail}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedDay !== null && selectedEvents.length === 0 && (
                    <div className="vest-calendar__detail">
                        <p className="vest-calendar__no-events">No vesting events on this day.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
