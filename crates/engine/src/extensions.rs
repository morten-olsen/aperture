use std::any::{Any, TypeId};
use std::collections::HashMap;

/// A type-safe map for storing services and shared data.
///
/// Each type can only have one entry. Types must be `Send + Sync + 'static`.
pub struct Extensions {
    map: HashMap<TypeId, Box<dyn Any + Send + Sync>>,
}

impl Extensions {
    pub fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }

    /// Insert a value of type `T`. Overwrites any existing value of the same type.
    pub fn insert<T: Send + Sync + 'static>(&mut self, value: T) {
        self.map.insert(TypeId::of::<T>(), Box::new(value));
    }

    /// Get a reference to the value of type `T`, if it exists.
    pub fn get<T: Send + Sync + 'static>(&self) -> Option<&T> {
        self.map
            .get(&TypeId::of::<T>())
            .and_then(|boxed| boxed.downcast_ref::<T>())
    }

    /// Check whether a value of type `T` exists.
    pub fn contains<T: Send + Sync + 'static>(&self) -> bool {
        self.map.contains_key(&TypeId::of::<T>())
    }
}

impl Default for Extensions {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_get_round_trip() {
        let mut ext = Extensions::new();
        ext.insert(42u32);
        ext.insert("hello".to_string());

        assert_eq!(ext.get::<u32>(), Some(&42));
        assert_eq!(ext.get::<String>(), Some(&"hello".to_string()));
    }

    #[test]
    fn get_missing_returns_none() {
        let ext = Extensions::new();
        assert_eq!(ext.get::<u32>(), None);
    }

    #[test]
    fn overwrite_replaces_value() {
        let mut ext = Extensions::new();
        ext.insert(1u32);
        ext.insert(2u32);
        assert_eq!(ext.get::<u32>(), Some(&2));
    }

    #[test]
    fn contains_reflects_presence() {
        let mut ext = Extensions::new();
        assert!(!ext.contains::<u32>());
        ext.insert(10u32);
        assert!(ext.contains::<u32>());
    }
}
