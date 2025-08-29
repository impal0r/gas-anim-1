// Queue implemented using circular buffers
// Borrowed from Tobias Quante
// https://blog.q-bit.me/mastering-efficient-queue-structures-in-typescript-a-complete-guide/

export class Queue<T> {
    private store: T[];
    private frontIndex: number; // Points to the first element
    private backIndex: number; // Points to the position where the next element will be added
    private capacity: number;
  
    constructor({
        initialCapacity,
        items,
    }: { initialCapacity?: number; items?: T[] } = {}) {
        this.store = new Array(initialCapacity || 10);
        this.frontIndex = 0;
        this.backIndex = 0;
        this.capacity = initialCapacity || 10;
  
        if (items && items.length > this.capacity) {
            this.resize(items.length);
        }
        if (items) {
            for (const item of items) {
                this.enqueue(item);
            }
        }
    }
  
    get length(): number {
        return this.backIndex - this.frontIndex;
    }
  
    get empty(): boolean {
        return this.length === 0;
    }
  
    enqueue(item: T): void {
        if (this.length === this.capacity) {
            this.resize(this.capacity * 2); // Double the capacity when full
        }
        this.store[this.backIndex % this.capacity] = item;
        this.backIndex++;
    }
  
    dequeue(): T | undefined {
        if (this.empty) {
            console.warn("Cannot dequeue, the queue is empty");
            return undefined;
        }
        const item = this.store[this.frontIndex % this.capacity];
        this.store[this.frontIndex % this.capacity] = undefined as any; // Clear the slot
        this.frontIndex++;
  
        if (this.length > 0 && this.length <= this.capacity / 4) {
            this.resize(this.capacity / 2);
        }
        return item;
    }
  
    peek(): T | undefined {
        if (this.empty) {
            return undefined;
        }
        return this.store[this.frontIndex % this.capacity];
    }
  
    private resize(newCapacity: number): void {
        const newStore = new Array(newCapacity);
        let writeIndex = 0;
  
        // Copy valid elements to the new array
        for (let i = this.frontIndex; i < this.backIndex; i++) {
            newStore[writeIndex] = this.store[i % this.capacity];
            writeIndex++;
        }
  
        this.store = newStore;
        this.capacity = newCapacity;
        this.frontIndex = 0;
        this.backIndex = writeIndex;
    }
  }