//! muretto realtime service — ingests the F1 live-timing feed, keeps a single
//! typed [`model::State`] in memory, and fans it out to browsers over SSE.

pub mod config;
pub mod ingest;
pub mod model;
pub mod server;
pub mod signalr;
