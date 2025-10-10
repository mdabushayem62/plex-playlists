/**
 * Analytics dashboard ("Nerd Lines")
 * Phase 1: Genre distribution, cache health, top unrated tracks, success rate
 */

import Html from '@kitajs/html';
import { Layout } from '../layout.tsx';

export interface AnalyticsPageProps {
  genreDistribution: Array<{ genre: string; count: number }>;
  cacheHealth: {
    artists: {
      cached: number;
      expired: number;
      total: number;
      coverage: number;
    };
    albums: {
      cached: number;
      expired: number;
      total: number;
      coverage: number;
    };
  };
  topUnratedTracks: Array<{
    title: string;
    artist: string;
    album: string;
    playCount: number;
  }>;
  jobStats: Array<{
    date: string;
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  }>;
  overallSuccessRate: number;
  timeOfDayHeatmap: number[][];
  ratingPlayCountData: Array<{
    title: string;
    artist: string;
    playCount: number;
    userRating: number; // From library, 0-1 scale
    ratingKey: string;
  }>;
  recencyDecayData: Array<{
    title: string;
    artist: string;
    daysSinceLastSeen: number;
    playCount: number;
    avgScore: number;
  }>;
  diversityMetrics: {
    genreDiversity: string;
    totalGenres: number;
    totalArtists: number;
    concentrationScore: string;
    top10Artists: Array<{
      artist: string;
      appearances: number;
    }>;
  };
  constellationData: {
    nodes: Array<{
      id: string;
      name: string;
      appearances: number;
    }>;
    links: Array<{
      source: string;
      target: string;
      strength: number;
    }>;
  };
  page: string;
  setupComplete: boolean;
  breadcrumbs: Array<{ label: string; url: string | null }>;
}

export function AnalyticsPage(props: AnalyticsPageProps): JSX.Element {
  const {
    genreDistribution,
    cacheHealth,
    topUnratedTracks,
    jobStats,
    overallSuccessRate,
    timeOfDayHeatmap,
    ratingPlayCountData,
    recencyDecayData,
    diversityMetrics,
    constellationData,
    page,
    setupComplete,
    breadcrumbs
  } = props;

  return (
    <Layout title="Nerd Lines" page={page} setupComplete={setupComplete}>
      <div>
        {/* Breadcrumbs */}
        <nav aria-label="breadcrumb" style="margin-bottom: 1rem;">
          <ol style="display: flex; list-style: none; padding: 0; gap: 0.5rem; font-size: 0.875rem; color: var(--pico-muted-color);">
            {breadcrumbs.map((crumb, i) => (
              <>
                {i > 0 && <li>›</li>}
                <li>
                  {crumb.url ? (
                    <a href={crumb.url}>{crumb.label}</a>
                  ) : (
                    <span style="color: var(--pico-contrast);">{crumb.label}</span>
                  )}
                </li>
              </>
            ))}
          </ol>
        </nav>

        <h2>📊 Nerd Lines</h2>
        <p style="color: var(--pico-muted-color); margin-bottom: 2rem;">
          Analytics and insights about your music library and playlist generation.
        </p>

        {/* Genre Distribution */}
        <section style="margin-bottom: 3rem;">
          <h3>Genre Distribution (Top 20)</h3>
          <div class="stat-card">
            <canvas id="genreChart" style="max-height: 400px;"></canvas>
          </div>
        </section>

        {/* Time-of-Day Heatmap */}
        <section style="margin-bottom: 3rem;">
          <h3>🕐 Listening Patterns</h3>
          <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 1rem;">
            When do YOU listen to music? Based on your last 90 days of listening history. Larger bubbles = more plays.
          </p>
          <div class="stat-card">
            <canvas id="heatmapChart" style="max-height: 400px;"></canvas>
          </div>
        </section>

        {/* Artist Constellation Map */}
        <section style="margin-bottom: 3rem;">
          <h3>Artist Constellation</h3>
          <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 1rem;">
            Your top 30 artists visualized by genre similarity. Artists connected by lines share genres.
          </p>
          <div class="stat-card">
            <canvas id="constellationChart" style="max-height: 600px;"></canvas>
          </div>
        </section>

        {/* Diversity Metrics */}
        <section style="margin-bottom: 3rem;">
          <h3>Library Diversity</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div class="stat-card">
              <h3 style="margin: 0 0 0.25rem 0;">{diversityMetrics.genreDiversity}%</h3>
              <p style="margin: 0;">Genre Diversity</p>
              <small style="color: var(--pico-muted-color);">
                {diversityMetrics.totalGenres} unique genres
              </small>
            </div>
            <div class="stat-card">
              <h3 style="margin: 0 0 0.25rem 0;">{diversityMetrics.concentrationScore}%</h3>
              <p style="margin: 0;">Top 10 Concentration</p>
              <small style="color: var(--pico-muted-color);">
                {diversityMetrics.totalArtists} unique artists
              </small>
            </div>
          </div>
          <div class="stat-card">
            <h4 style="margin: 0 0 1rem 0;">Top 10 Most Listened Artists (90 days)</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;">
              {diversityMetrics.top10Artists.map((artist, idx) => (
                <div style="display: flex; justify-content: space-between; padding: 0.25rem 0.5rem; background: var(--pico-background-color); border-radius: 0.25rem;">
                  <span style="font-size: 0.875rem;">{idx + 1}. {artist.artist}</span>
                  <span style="font-size: 0.875rem; color: var(--pico-muted-color);">{artist.appearances} plays</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Rating vs Play Count Scatter */}
        <section style="margin-bottom: 3rem;">
          <h3>💎 Hidden Gems & Guilty Pleasures</h3>
          <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 1rem;">
            Based on YOUR library ratings and play counts. Top-left: guilty pleasures (high plays, lower ratings). Top-right: hidden gems (high ratings, fewer plays).
          </p>
          <div class="stat-card">
            <canvas id="scatterChart" style="max-height: 500px;"></canvas>
          </div>
        </section>

        {/* Recency Decay */}
        <section style="margin-bottom: 3rem;">
          <h3>Forgotten Favorites</h3>
          <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 1rem;">
            Tracks you used to love but haven't appeared in playlists recently. Time to rediscover them?
          </p>
          <div class="stat-card">
            <canvas id="recencyChart" style="max-height: 400px;"></canvas>
          </div>
        </section>

        {/* Top Unrated Tracks */}
        <section>
          <h3>❌ Top Unrated Tracks</h3>
          <p style="color: var(--pico-muted-color); font-size: 0.875rem; margin-bottom: 1rem;">
            These tracks have high play counts but NO user rating. Consider rating them to improve recommendations!
          </p>
          {topUnratedTracks.length === 0 ? (
            <p style="color: var(--pico-muted-color);">All your frequently played tracks are rated! 🌟</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th style="text-align: right;">Play Count</th>
                </tr>
              </thead>
              <tbody>
                {topUnratedTracks.slice(0, 10).map(track => (
                  <tr>
                    <td>{track.title}</td>
                    <td>{track.artist}</td>
                    <td>{track.album}</td>
                    <td style="text-align: right;">{track.playCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

        {/* Cache Health Gauges */}
        <section style="margin-bottom: 3rem;">
          <h3>Cache Health</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
            {/* Artist Cache */}
            <div class="stat-card">
              <h4 style="margin: 0 0 1rem 0;">Artist Genre Cache</h4>
              <div style="position: relative; height: 120px; display: flex; align-items: center; justify-content: center;">
                <svg width="120" height="120" style="transform: rotate(-90deg);">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--pico-muted-border-color)"
                    stroke-width="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--pico-primary)"
                    stroke-width="10"
                    stroke-dasharray={`${(cacheHealth.artists.coverage / 100) * 314} 314`}
                    stroke-linecap="round"
                  />
                </svg>
                <div style="position: absolute; text-align: center;">
                  <div style="font-size: 1.5rem; font-weight: bold;">{Math.round(cacheHealth.artists.coverage)}%</div>
                  <div style="font-size: 0.75rem; color: var(--pico-muted-color);">coverage</div>
                </div>
              </div>
              <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--pico-muted-color);">
                <div>{cacheHealth.artists.cached.toLocaleString()} cached artists</div>
                {cacheHealth.artists.expired > 0 && (
                  <div style="color: var(--pico-del-color);">
                    ⚠️ {cacheHealth.artists.expired} expired
                  </div>
                )}
              </div>
            </div>

            {/* Album Cache */}
            <div class="stat-card">
              <h4 style="margin: 0 0 1rem 0;">Album Genre Cache</h4>
              <div style="position: relative; height: 120px; display: flex; align-items: center; justify-content: center;">
                <svg width="120" height="120" style="transform: rotate(-90deg);">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--pico-muted-border-color)"
                    stroke-width="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--pico-primary)"
                    stroke-width="10"
                    stroke-dasharray={`${(cacheHealth.albums.coverage / 100) * 314} 314`}
                    stroke-linecap="round"
                  />
                </svg>
                <div style="position: absolute; text-align: center;">
                  <div style="font-size: 1.5rem; font-weight: bold;">{Math.round(cacheHealth.albums.coverage)}%</div>
                  <div style="font-size: 0.75rem; color: var(--pico-muted-color);">coverage</div>
                </div>
              </div>
              <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--pico-muted-color);">
                <div>{cacheHealth.albums.cached.toLocaleString()} cached albums</div>
                {cacheHealth.albums.expired > 0 && (
                  <div style="color: var(--pico-del-color);">
                    ⚠️ {cacheHealth.albums.expired} expired
                  </div>
                )}
              </div>
            </div>

            {/* Overall Success Rate */}
            <div class="stat-card">
              <h4 style="margin: 0 0 1rem 0;">Playlist Success Rate (30d)</h4>
              <div style="position: relative; height: 120px; display: flex; align-items: center; justify-content: center;">
                <svg width="120" height="120" style="transform: rotate(-90deg);">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="var(--pico-muted-border-color)"
                    stroke-width="10"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke={overallSuccessRate >= 80 ? 'var(--pico-ins-color)' : overallSuccessRate >= 50 ? 'var(--pico-primary)' : 'var(--pico-del-color)'}
                    stroke-width="10"
                    stroke-dasharray={`${(overallSuccessRate / 100) * 314} 314`}
                    stroke-linecap="round"
                  />
                </svg>
                <div style="position: absolute; text-align: center;">
                  <div style="font-size: 1.5rem; font-weight: bold;">{Math.round(overallSuccessRate)}%</div>
                  <div style="font-size: 0.75rem; color: var(--pico-muted-color);">success</div>
                </div>
              </div>
              <div style="margin-top: 1rem; font-size: 0.875rem; text-align: center; color: var(--pico-muted-color);">
                {jobStats.reduce((acc, day) => acc + day.total, 0)} total jobs
              </div>
            </div>
          </div>
        </section>

        {/* Playlist Success Timeline */}
        <section style="margin-bottom: 3rem;">
          <h3>Playlist Generation Success Rate</h3>
          <div class="stat-card">
            <canvas id="successChart" style="max-height: 300px;"></canvas>
          </div>
        </section>

      {/* Load Chart.js and render charts */}
      <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
      <script>{`
        // Genre Distribution Chart
        const genreCtx = document.getElementById('genreChart');
        if (genreCtx) {
          new Chart(genreCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(genreDistribution.map(g => g.genre))},
              datasets: [{
                label: 'Cached Artists',
                data: ${JSON.stringify(genreDistribution.map(g => g.count))},
                backgroundColor: 'rgba(66, 135, 245, 0.6)',
                borderColor: 'rgba(66, 135, 245, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                title: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0
                  }
                }
              }
            }
          });
        }

        // Success Rate Timeline Chart
        const successCtx = document.getElementById('successChart');
        if (successCtx) {
          new Chart(successCtx, {
            type: 'line',
            data: {
              labels: ${JSON.stringify(jobStats.map(j => j.date))},
              datasets: [
                {
                  label: 'Successful',
                  data: ${JSON.stringify(jobStats.map(j => j.successful))},
                  backgroundColor: 'rgba(72, 187, 120, 0.2)',
                  borderColor: 'rgba(72, 187, 120, 1)',
                  borderWidth: 2,
                  fill: true
                },
                {
                  label: 'Failed',
                  data: ${JSON.stringify(jobStats.map(j => j.failed))},
                  backgroundColor: 'rgba(245, 101, 101, 0.2)',
                  borderColor: 'rgba(245, 101, 101, 1)',
                  borderWidth: 2,
                  fill: true
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                mode: 'index',
                intersect: false
              },
              plugins: {
                legend: {
                  position: 'top'
                }
              },
              scales: {
                y: {
                  beginAtZero: true,
                  stacked: false,
                  ticks: {
                    precision: 0
                  }
                },
                x: {
                  ticks: {
                    maxRotation: 45,
                    minRotation: 45
                  }
                }
              }
            }
          });
        }

        // Time-of-Day Heatmap (Matrix Chart)
        const heatmapCtx = document.getElementById('heatmapChart');
        if (heatmapCtx) {
          const heatmapData = ${JSON.stringify(timeOfDayHeatmap)};
          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const hours = Array.from({length: 24}, (_, i) => i);

          // Flatten data for Chart.js matrix
          const matrixData = [];
          for (let day = 0; day < 7; day++) {
            for (let hour = 0; hour < 24; hour++) {
              matrixData.push({
                x: hour,
                y: day,
                v: heatmapData[day][hour]
              });
            }
          }

          // Find max value for color scaling
          const maxValue = Math.max(...matrixData.map(d => d.v));

          new Chart(heatmapCtx, {
            type: 'bubble',
            data: {
              datasets: [{
                label: 'Playlist Activity',
                data: matrixData.map(d => ({
                  x: d.x,
                  y: d.y,
                  r: d.v > 0 ? Math.max(8, Math.sqrt(d.v) * 3) : 0
                })),
                backgroundColor: function(context) {
                  const index = context.dataIndex;
                  const value = matrixData[index].v;
                  if (value === 0) return 'rgba(66, 135, 245, 0.1)';
                  const intensity = value / maxValue;
                  return 'rgba(66, 135, 245, ' + (0.3 + intensity * 0.6) + ')';
                },
                borderColor: 'rgba(66, 135, 245, 1)',
                borderWidth: 1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const dataIndex = context.dataIndex;
                      const value = matrixData[dataIndex].v;
                      const hour = matrixData[dataIndex].x;
                      const day = days[matrixData[dataIndex].y];
                      return [
                        day + ' at ' + hour + ':00',
                        'Tracks played: ' + value
                      ];
                    }
                  }
                }
              },
              scales: {
                x: {
                  type: 'linear',
                  min: -0.5,
                  max: 23.5,
                  ticks: {
                    stepSize: 1,
                    callback: function(value) {
                      return value + 'h';
                    }
                  },
                  title: {
                    display: true,
                    text: 'Hour of Day'
                  }
                },
                y: {
                  type: 'linear',
                  min: -0.5,
                  max: 6.5,
                  ticks: {
                    stepSize: 1,
                    callback: function(value) {
                      return days[Math.round(value)] || '';
                    }
                  },
                  title: {
                    display: true,
                    text: 'Day of Week'
                  }
                }
              }
            }
          });
        }

        // Artist Constellation (Force-Directed Network)
        const constellationCtx = document.getElementById('constellationChart');
        if (constellationCtx) {
          const nodes = ${JSON.stringify(constellationData.nodes)};
          const links = ${JSON.stringify(constellationData.links)};

          // Simple force simulation in Canvas
          const width = constellationCtx.parentElement.offsetWidth;
          const height = 600;

          // Initialize node positions randomly
          nodes.forEach(node => {
            node.x = Math.random() * width;
            node.y = Math.random() * height;
            node.vx = 0;
            node.vy = 0;
          });

          // Force simulation parameters
          const centerForce = 0.01;
          const repelForce = 500;
          const linkForce = 0.1;
          const damping = 0.8;

          // Run simulation
          function simulate(iterations = 100) {
            for (let iter = 0; iter < iterations; iter++) {
              // Reset forces
              nodes.forEach(node => {
                node.vx = 0;
                node.vy = 0;
              });

              // Center force
              nodes.forEach(node => {
                node.vx += (width / 2 - node.x) * centerForce;
                node.vy += (height / 2 - node.y) * centerForce;
              });

              // Repel force between all nodes
              for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                  const dx = nodes[j].x - nodes[i].x;
                  const dy = nodes[j].y - nodes[i].y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const force = repelForce / (dist * dist);
                  nodes[i].vx -= (dx / dist) * force;
                  nodes[i].vy -= (dy / dist) * force;
                  nodes[j].vx += (dx / dist) * force;
                  nodes[j].vy += (dy / dist) * force;
                }
              }

              // Link force
              links.forEach(link => {
                const source = nodes.find(n => n.id === link.source);
                const target = nodes.find(n => n.id === link.target);
                if (source && target) {
                  const dx = target.x - source.x;
                  const dy = target.y - source.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const force = (dist - 100) * linkForce * link.strength;
                  source.vx += (dx / dist) * force;
                  source.vy += (dy / dist) * force;
                  target.vx -= (dx / dist) * force;
                  target.vy -= (dy / dist) * force;
                }
              });

              // Update positions with damping
              nodes.forEach(node => {
                node.x += node.vx * damping;
                node.y += node.vy * damping;
                // Keep in bounds
                node.x = Math.max(30, Math.min(width - 30, node.x));
                node.y = Math.max(30, Math.min(height - 30, node.y));
              });
            }
          }

          simulate(150);

          // Draw on canvas
          const ctx = constellationCtx.getContext('2d');
          ctx.clearRect(0, 0, width, height);

          // Draw links
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
          ctx.lineWidth = 1;
          links.forEach(link => {
            const source = nodes.find(n => n.id === link.source);
            const target = nodes.find(n => n.id === link.target);
            if (source && target) {
              ctx.beginPath();
              ctx.moveTo(source.x, source.y);
              ctx.lineTo(target.x, target.y);
              ctx.stroke();
            }
          });

          // Draw nodes
          nodes.forEach(node => {
            const radius = 5 + Math.sqrt(node.appearances) * 2;
            ctx.fillStyle = 'rgba(66, 135, 245, 0.8)';
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = 'rgba(66, 135, 245, 1)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.name, node.x, node.y - radius - 5);
          });
        }

        // Rating vs Play Count Scatter Chart
        const scatterCtx = document.getElementById('scatterChart');
        if (scatterCtx) {
          const scatterData = ${JSON.stringify(ratingPlayCountData)};

          new Chart(scatterCtx, {
            type: 'scatter',
            data: {
              datasets: [{
                label: 'Library Tracks',
                data: scatterData.map(t => ({
                  x: t.playCount,
                  y: t.userRating,
                  title: t.title,
                  artist: t.artist
                })),
                backgroundColor: 'rgba(66, 135, 245, 0.5)',
                borderColor: 'rgba(66, 135, 245, 1)',
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 8
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const point = context.raw;
                      const rating = point.y > 0 ? (point.y * 10).toFixed(1) + ' stars' : 'Unrated';
                      return [
                        point.artist + ' - ' + point.title,
                        'Play Count: ' + point.x,
                        'Your Rating: ' + rating
                      ];
                    }
                  }
                }
              },
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Play Count (from library)'
                  },
                  beginAtZero: true
                },
                y: {
                  title: {
                    display: true,
                    text: 'Your Star Rating (0-1 scale)'
                  },
                  beginAtZero: true,
                  max: 1
                }
              }
            }
          });
        }

        // Recency Decay Chart
        const recencyCtx = document.getElementById('recencyChart');
        if (recencyCtx) {
          const recencyData = ${JSON.stringify(recencyDecayData)};

          // Filter to tracks not seen in last 7 days but with high scores
          const forgottenFavorites = recencyData
            .filter(t => t.daysSinceLastSeen > 7 && t.avgScore > 0.5)
            .slice(0, 50);

          new Chart(recencyCtx, {
            type: 'scatter',
            data: {
              datasets: [{
                label: 'Forgotten Tracks',
                data: forgottenFavorites.map(t => ({
                  x: t.daysSinceLastSeen,
                  y: t.avgScore,
                  title: t.title,
                  artist: t.artist,
                  playCount: t.playCount
                })),
                backgroundColor: function(context) {
                  const value = context.raw.y;
                  if (value > 0.7) return 'rgba(245, 101, 101, 0.6)'; // High score - definitely forgotten!
                  if (value > 0.5) return 'rgba(245, 201, 101, 0.6)'; // Medium score
                  return 'rgba(66, 135, 245, 0.3)';
                },
                borderColor: function(context) {
                  const value = context.raw.y;
                  if (value > 0.7) return 'rgba(245, 101, 101, 1)';
                  if (value > 0.5) return 'rgba(245, 201, 101, 1)';
                  return 'rgba(66, 135, 245, 1)';
                },
                borderWidth: 1,
                pointRadius: function(context) {
                  const score = context.raw.y;
                  return score > 0.7 ? 8 : 5; // Bigger dots for high scores
                },
                pointHoverRadius: 10
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  callbacks: {
                    label: function(context) {
                      const point = context.raw;
                      return [
                        point.artist + ' - ' + point.title,
                        'Last seen: ' + point.x + ' days ago',
                        'Score: ' + point.y.toFixed(2),
                        'Previous appearances: ' + point.playCount
                      ];
                    }
                  }
                }
              },
              scales: {
                x: {
                  title: {
                    display: true,
                    text: 'Days Since Last Playlist Appearance'
                  },
                  beginAtZero: true
                },
                y: {
                  title: {
                    display: true,
                    text: 'Average Score'
                  },
                  min: 0,
                  max: 1
                }
              }
            }
          });
        }
      `}</script>
    </Layout>
  );
}
