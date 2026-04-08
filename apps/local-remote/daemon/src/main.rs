mod api;
mod config;
mod events;
mod farrago;
mod logic;
mod now_playing;
mod osc_listener;
mod osc_send;
mod play_monitor;
mod redis_worker;
mod state;

use crate::config::load_or_create_default;
use crate::state::AppState;
use anyhow::Context;
use axum::Router;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::signal;
use tracing::{info, Level};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::builder()
                .with_default_directive(Level::INFO.into())
                .from_env_lossy(),
        )
        .init();

    let cfg = load_or_create_default().context("load config")?;
    let listen = cfg.http_listen.clone();

    let state = Arc::new(AppState::new(cfg));
    let redis_state = state.clone();
    tokio::spawn(async move {
        redis_worker::run_redis_loop(redis_state).await;
    });

    let osc_in_state = state.clone();
    tokio::spawn(async move {
        osc_listener::run_osc_listener(osc_in_state).await;
    });

    let play_mon_state = state.clone();
    tokio::spawn(async move {
        play_monitor::run_play_monitor(play_mon_state).await;
    });

    let np_state = state.clone();
    tokio::spawn(async move {
        now_playing::run_now_playing_watcher(np_state).await;
    });

    let app: Router = api::build_router(state.clone());

    let listener = TcpListener::bind(&listen)
        .await
        .with_context(|| format!("bind HTTP {listen}"))?;
    info!("local-remote UI + API: http://{listen}/");

    let shutdown = async {
        let _ = signal::ctrl_c().await;
        info!("shutdown signal received");
    };

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
        .context("axum serve")?;

    Ok(())
}
