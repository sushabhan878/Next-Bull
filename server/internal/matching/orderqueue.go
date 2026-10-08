package matching

import (
	"github.com/GC-OpenSoft-2026/Algorithmic-Trading-Simulator/internal/models"
)

type OrderNode struct {
	Order models.Order
	Prev  *OrderNode
	Next  *OrderNode
}

type OrderQueue struct {
	Head *OrderNode
	Tail *OrderNode
	Size int64
}

func (q *OrderQueue) Push(o models.Order) *OrderNode{
	var node *OrderNode = &OrderNode{
		Order: o,
	}
	if q.Tail == nil {
		q.Head = node
		q.Tail = node
	}else{
		node.Prev = q.Tail
		q.Tail.Next = node
		q.Tail = node
	}
	q.Size++
	return node
}

func (q *OrderQueue) Front() *OrderNode {
    return q.Head
}

func (q *OrderQueue) PopFront() {
    if q.Head == nil {
        return
    }
	old := q.Head
    q.Head = q.Head.Next
    if q.Head != nil {
        q.Head.Prev = nil
    } else {
        q.Tail = nil
    }
	old.Next=nil
	if q.Size > 0 {
    	q.Size--
	}
}

func (q *OrderQueue) Remove(node *OrderNode) {
    if node == nil {
        return
    }
    
	if node.Prev != nil {
        node.Prev.Next = node.Next
    } else {
        q.Head = node.Next
    }
    
	if node.Next != nil {
        node.Next.Prev = node.Prev
    }else {
        q.Tail = node.Prev
    }

	node.Next=nil
	node.Prev=nil
	if q.Size > 0 {
    	q.Size--
	}
}

func (q *OrderQueue) Empty() bool {
    return q.Head == nil
}

// these functions alows us to push order, pop order (dequeue),cancel order in O(1) time, whereas before it was O(N)
// we need to keep a map[orderid]->pointer to node so that it woks in O(1)