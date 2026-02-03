// ==================== 全局变量 ====================
let animationIntervals = [];
let animationTimeouts = [];

// 正常传输相关变量
let normalTransmissionActive = false;
let txSeq = 0;
let rxSeq = 0;
let outstanding = 0;
let acked_seq = -1; // 最新确认的序列号

// 超时重传相关变量
let timeoutTimer = 0;
let replayCount = 0;
const replayMax = 3;

// 状态机相关变量
let txStates = ['off', 'init', 'advance', 'replay', 'flush'];
let currentTxState = 0;
let rxStates = ['off', 'send-acks', 'send-nack', 'nack-sent'];
let currentRxState = 0;

// ==================== 辅助函数 ====================
function clearAllAnimations() {
    animationIntervals.forEach(interval => clearInterval(interval));
    animationTimeouts.forEach(timeout => clearTimeout(timeout));
    animationIntervals = [];
    animationTimeouts = [];
}

function showScene(sceneId) {
    clearAllAnimations();
    
    // 隐藏所有场景
    document.querySelectorAll('.scene').forEach(scene => {
        scene.classList.remove('active');
    });
    
    // 显示选中的场景
    document.getElementById(sceneId).classList.add('active');
    
    // 更新按钮状态
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

function addLog(containerId, message, type = 'info') {
    const logContainer = document.getElementById(containerId);
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function addTimelineItem(containerId, text, delay) {
    const timeout = setTimeout(() => {
        const timeline = document.getElementById(containerId);
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.style.animationDelay = '0s';
        item.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">${text}</div>
        `;
        timeline.appendChild(item);
    }, delay);
    animationTimeouts.push(timeout);
}

// ==================== 场景2: LLR初始化 ====================
function startInitAnimation() {
    clearAllAnimations();
    const timeline = document.getElementById('init-timeline');
    const log = document.getElementById('init-log');
    timeline.innerHTML = '';
    log.innerHTML = '';

    addLog('init-log', '开始LLR初始化过程...', 'info');
    addTimelineItem('init-timeline', '发送端：设置 llr_mode_local = ON', 0);
    
    setTimeout(() => {
        document.getElementById('init-sender-status').textContent = 'INIT状态';
        addLog('init-log', '发送端进入INIT状态', 'info');
    }, 500);

    addTimelineItem('init-timeline', '发送端：发送 LLR_INIT 控制消息 (init_seq = tx_seq)', 1000);
    
    setTimeout(() => {
        const container = document.getElementById('init-container');
        const packet = document.createElement('div');
        packet.className = 'packet';
        packet.textContent = 'LLR_INIT';
        packet.style.left = '20%';
        packet.style.top = '45%';
        packet.style.background = 'linear-gradient(135deg, #9C27B0 0%, #673AB7 100%)';
        container.appendChild(packet);
        
        packet.style.animation = 'moveRight 2s forwards';
        addLog('init-log', '传输 LLR_INIT 消息...', 'info');
        
        setTimeout(() => {
            packet.remove();
            addLog('init-log', '接收端收到 LLR_INIT', 'success');
        }, 2000);
    }, 1500);

    addTimelineItem('init-timeline', '接收端：接收 LLR_INIT，设置 llr_mode_local = ON', 3500);
    
    setTimeout(() => {
        document.getElementById('init-receiver-status').textContent = 'SEND_ACKS';
        addLog('init-log', '接收端进入SEND_ACKS状态', 'success');
    }, 4000);

    addTimelineItem('init-timeline', '接收端：发送 LLR_INIT_ECHO 确认消息', 4500);
    
    setTimeout(() => {
        const container = document.getElementById('init-container');
        const packet = document.createElement('div');
        packet.className = 'packet ack';
        packet.textContent = 'LLR_INIT_ECHO';
        packet.style.right = '20%';
        packet.style.top = '55%';
        packet.style.background = 'linear-gradient(135deg, #00BCD4 0%, #0097A7 100%)';
        container.appendChild(packet);
        
        packet.style.animation = 'moveLeft 2s forwards';
        addLog('init-log', '传输 LLR_INIT_ECHO...', 'info');
        
        setTimeout(() => {
            packet.remove();
            addLog('init-log', '发送端收到 LLR_INIT_ECHO', 'success');
        }, 2000);
    }, 5000);

    addTimelineItem('init-timeline', '发送端：验证 init_echo_received = TRUE', 7000);
    
    setTimeout(() => {
        document.getElementById('init-sender-status').textContent = 'ADVANCE';
        addLog('init-log', '发送端进入ADVANCE状态', 'success');
        addLog('init-log', 'LLR初始化完成！可以开始数据传输', 'success');
    }, 7500);

    addTimelineItem('init-timeline', '✅ LLR初始化完成，双方进入工作状态', 7500);
}

function resetInitAnimation() {
    clearAllAnimations();
    document.getElementById('init-timeline').innerHTML = '';
    document.getElementById('init-log').innerHTML = '';
    document.getElementById('init-sender-status').textContent = 'INIT状态';
    document.getElementById('init-receiver-status').textContent = '等待INIT';
    
    // 清除所有动画包
    document.querySelectorAll('#init-container .packet').forEach(p => p.remove());
}

// ==================== 场景3: 正常传输 ====================
function startNormalTransmission() {
    if (normalTransmissionActive) return;
    
    normalTransmissionActive = true;
    txSeq = 0;
    rxSeq = 0;
    outstanding = 0;
    acked_seq = -1;
    
    document.getElementById('normal-log').innerHTML = '';
    addLog('normal-log', '开始正常数据传输...', 'info');
    addLog('normal-log', 'Replay Buffer只在收到ACK时才释放空间', 'info');
    
    // 初始化buffer显示
    updateSequenceDisplay();
    updateBufferDisplay();
    
    const interval = setInterval(() => {
        if (!normalTransmissionActive) return;
        
        // 发送数据包
        sendNormalPacket();
        
        // 每5个包发送一次ACK
        if (txSeq % 5 === 0 && outstanding > 0) {
            setTimeout(() => sendAck(), 1500);
        }
    }, 2000);
    
    animationIntervals.push(interval);
}

function sendNormalPacket() {
    const container = document.getElementById('normal-container');
    const packet = document.createElement('div');
    packet.className = 'packet llr-eligible';
    packet.textContent = `SEQ:${txSeq}`;
    packet.style.left = '20%';
    packet.style.top = '45%';
    container.appendChild(packet);
    
    const currentSeq = txSeq;
    packet.style.animation = 'moveRight 1.5s forwards';
    
    addLog('normal-log', `发送 LLR-eligible 帧，序列号=${currentSeq}`, 'info');
    
    txSeq++;
    outstanding++;
    updateSequenceDisplay();
    updateBufferDisplay();
    
    setTimeout(() => {
        packet.remove();
        rxSeq++;
        updateSequenceDisplay();
        addLog('normal-log', `接收端收到帧 SEQ=${currentSeq}`, 'success');
    }, 1500);
}

function sendAck() {
    const container = document.getElementById('normal-container');
    const ack = document.createElement('div');
    ack.className = 'packet ack';
    ack.textContent = `ACK:${rxSeq-1}`;
    ack.style.right = '20%';
    ack.style.top = '55%';
    container.appendChild(ack);
    
    const ackSeq = rxSeq - 1;
    ack.style.animation = 'moveLeft 1.5s forwards';
    
    addLog('normal-log', `接收端发送 ACK，ack_nack_seq=${ackSeq}`, 'info');
    
    setTimeout(() => {
        ack.remove();
        
        // 修正：根据LLR规范 5.1.8
        // "The replay buffer can remove all the frames up to and including 
        // the frame whose sequence number is the ack_nack_seq."
        const oldAckedSeq = acked_seq;
        acked_seq = ackSeq; // 更新acked_seq
        
        // outstanding_seq = ((tx_seq – 1) – acked_seq) mod 1048576
        outstanding = Math.max(0, txSeq - 1 - acked_seq);
        
        updateSequenceDisplay();
        updateBufferDisplay();
        addLog('normal-log', `发送端收到 ACK=${ackSeq}，acked_seq从${oldAckedSeq}更新为${acked_seq}`, 'success');
        addLog('normal-log', `释放所有 SEQ≤${ackSeq} 的replay buffer，outstanding=${outstanding}`, 'success');
    }, 1500);
}

function updateSequenceDisplay() {
    document.getElementById('tx-seq').textContent = txSeq;
    document.getElementById('rx-seq').textContent = rxSeq;
    document.getElementById('outstanding').textContent = outstanding;
    document.getElementById('acked-seq').textContent = acked_seq;
}

function updateBufferDisplay() {
    const bufferDisplay = document.getElementById('buffer-display');
    bufferDisplay.innerHTML = '';
    
    // 显示8个buffer槽位
    for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div');
        slot.className = 'buffer-slot';
        
        // 计算此槽位对应的序列号
        // 显示范围：从 acked_seq+1 开始的未确认帧
        const seq_num = (acked_seq + 1) + i;
        
        // 判断槽位状态
        if (seq_num < txSeq && seq_num > acked_seq) {
            // 在replay buffer中，等待ACK
            slot.classList.add('filled');
            slot.textContent = `${seq_num}`;
            slot.title = `等待ACK的帧 SEQ=${seq_num}`;
        } else if (seq_num === acked_seq && acked_seq >= 0) {
            // 最近被ACK的帧（显示1个）
            slot.classList.add('acked');
            slot.textContent = `${seq_num}✓`;
            slot.title = `已确认 SEQ=${seq_num}`;
        } else if (seq_num >= txSeq) {
            // 未来的帧（还没发送）
            slot.textContent = '-';
            slot.title = '空闲槽位';
        } else {
            // 已确认的旧帧
            slot.textContent = '-';
            slot.title = '空闲槽位';
        }
        
        bufferDisplay.appendChild(slot);
    }
}

function stopNormalTransmission() {
    normalTransmissionActive = false;
    addLog('normal-log', '停止传输', 'warning');
    addLog('normal-log', `注意：Replay Buffer中的${outstanding}个帧保持不变，等待ACK`, 'warning');
}

function resetNormalTransmission() {
    stopNormalTransmission();
    clearAllAnimations();
    txSeq = 0;
    rxSeq = 0;
    outstanding = 0;
    acked_seq = -1;
    updateSequenceDisplay();
    updateBufferDisplay();
    document.getElementById('normal-log').innerHTML = '';
    document.querySelectorAll('#normal-container .packet').forEach(p => p.remove());
}

// ==================== 场景4: ACK机制 ====================
function startAckDemo() {
    clearAllAnimations();
    document.getElementById('ack-timeline').innerHTML = '';
    document.getElementById('ack-log').innerHTML = '';
    
    addLog('ack-log', '演示ACK确认机制...', 'info');
    addLog('ack-log', 'ACK会释放所有≤ack_nack_seq的replay buffer帧', 'info');
    
    for (let i = 0; i < 5; i++) {
        const delay = i * 2000;
        
        addTimelineItem('ack-timeline', `发送端：发送帧 SEQ=${i}`, delay);
        
        setTimeout(() => {
            const container = document.getElementById('ack-container');
            const packet = document.createElement('div');
            packet.className = 'packet llr-eligible';
            packet.textContent = `SEQ:${i}`;
            packet.style.left = '20%';
            packet.style.top = '45%';
            container.appendChild(packet);
            
            packet.style.animation = 'moveRight 1.5s forwards';
            addLog('ack-log', `发送 SEQ=${i}，存入replay buffer`, 'info');
            
            setTimeout(() => {
                packet.remove();
                addLog('ack-log', `接收端收到 SEQ=${i}`, 'success');
            }, 1500);
        }, delay);
    }
    
    // 发送ACK
    addTimelineItem('ack-timeline', '接收端：周期性发送 LLR_ACK (ack_nack_seq=4)', 10000);
    
    setTimeout(() => {
        const container = document.getElementById('ack-container');
        const ack = document.createElement('div');
        ack.className = 'packet ack';
        ack.textContent = 'ACK:4';
        ack.style.right = '20%';
        ack.style.top = '55%';
        container.appendChild(ack);
        
        ack.style.animation = 'moveLeft 1.5s forwards';
        addLog('ack-log', '发送 LLR_ACK, ack_nack_seq=4', 'info');
        
        setTimeout(() => {
            ack.remove();
            addLog('ack-log', '发送端收到ACK，acked_seq更新为4', 'success');
            addLog('ack-log', '释放所有 SEQ≤4 的replay buffer (SEQ 0-4)', 'success');
        }, 1500);
    }, 10500);

    addTimelineItem('ack-timeline', '✅ Replay buffer空间被释放，可以发送新帧', 12000);
}

function resetAckDemo() {
    clearAllAnimations();
    document.getElementById('ack-timeline').innerHTML = '';
    document.getElementById('ack-log').innerHTML = '';
    document.querySelectorAll('#ack-container .packet').forEach(p => p.remove());
}

// ==================== 场景5: 错包处理 ====================
function startErrorDemo() {
    clearAllAnimations();
    document.getElementById('error-timeline').innerHTML = '';
    document.getElementById('error-log').innerHTML = '';
    
    addLog('error-log', '模拟FCS错误检测...', 'warning');
    
    // 发送正常包
    addTimelineItem('error-timeline', '发送端：发送帧 SEQ=0 (正常)', 0);
    setTimeout(() => sendErrorPacket(0, false), 500);
    
    // 发送错误包
    addTimelineItem('error-timeline', '发送端：发送帧 SEQ=1', 2000);
    addTimelineItem('error-timeline', '⚠️ 链路错误：帧SEQ=1 FCS校验失败', 3500);
    setTimeout(() => sendErrorPacket(1, true), 2500);
    
    // 发送NACK
    addTimelineItem('error-timeline', '接收端：fcs_status=BAD && expected_frame=TRUE，发送 LLR_NACK', 5500);
    setTimeout(() => {
        document.getElementById('error-receiver-status').textContent = 'SEND_NACK';
        sendNack(1);
    }, 6000);
    
    // 重传
    addTimelineItem('error-timeline', '发送端：收到NACK，nack_received=TRUE，进入REPLAY状态', 8000);
    setTimeout(() => {
        document.getElementById('error-sender-status').textContent = 'REPLAY';
        addLog('error-log', '进入REPLAY状态，准备重传', 'warning');
    }, 8500);
    
    addTimelineItem('error-timeline', '发送端：从replay buffer重传帧 SEQ=1', 9000);
    setTimeout(() => sendErrorPacket(1, false), 9500);
    
    addTimelineItem('error-timeline', '✅ 重传成功，恢复正常传输', 11500);
    setTimeout(() => {
        document.getElementById('error-sender-status').textContent = 'ADVANCE';
        document.getElementById('error-receiver-status').textContent = 'SEND_ACKS';
        addLog('error-log', '恢复正常传输状态', 'success');
    }, 12000);
}

function sendErrorPacket(seq, hasError) {
    const container = document.getElementById('error-container');
    const packet = document.createElement('div');
    packet.className = hasError ? 'packet error' : 'packet llr-eligible';
    packet.textContent = `SEQ:${seq}`;
    packet.style.left = '20%';
    packet.style.top = '45%';
    container.appendChild(packet);
    
    packet.style.animation = 'moveRight 1.5s forwards';
    addLog('error-log', `发送 SEQ=${seq}${hasError ? ' (将发生FCS错误)' : ''}`, hasError ? 'warning' : 'info');
    
    setTimeout(() => {
        packet.remove();
        if (hasError) {
            addLog('error-log', `❌ SEQ=${seq} FCS校验失败 (fcs_status=BAD)`, 'error');
        } else {
            addLog('error-log', `✓ SEQ=${seq} 接收成功`, 'success');
        }
    }, 1500);
}

function sendNack(seq) {
    const container = document.getElementById('error-container');
    const nack = document.createElement('div');
    nack.className = 'packet nack';
    nack.textContent = `NACK:${seq}`;
    nack.style.right = '20%';
    nack.style.top = '55%';
    container.appendChild(nack);
    
    nack.style.animation = 'moveLeft 1.5s forwards';
    addLog('error-log', `发送 LLR_NACK, ack_nack_seq=${seq}`, 'warning');
    
    setTimeout(() => {
        nack.remove();
        addLog('error-log', `收到 NACK=${seq}，触发重传`, 'warning');
    }, 1500);
}

function resetErrorDemo() {
    clearAllAnimations();
    document.getElementById('error-timeline').innerHTML = '';
    document.getElementById('error-log').innerHTML = '';
    document.getElementById('error-sender-status').textContent = 'ADVANCE';
    document.getElementById('error-receiver-status').textContent = 'SEND_ACKS';
    document.querySelectorAll('#error-container .packet').forEach(p => p.remove());
}
// ==================== 场景6: 丢包恢复 ====================
function startLossDemo() {
    clearAllAnimations();
    document.getElementById('loss-timeline').innerHTML = '';
    document.getElementById('loss-log').innerHTML = '';
    
    addLog('loss-log', '模拟丢包场景...', 'warning');
    
    // 发送帧 SEQ=0
    addTimelineItem('loss-timeline', '✓ 发送帧 SEQ=0，接收成功', 0);
    setTimeout(() => {
        sendLossPacket(0, false);
    }, 500);
    
    // 发送帧 SEQ=1
    addTimelineItem('loss-timeline', '✓ 发送帧 SEQ=1，接收成功', 2000);
    setTimeout(() => {
        sendLossPacket(1, false);
    }, 2500);
    
    // 丢失帧 SEQ=2
    addTimelineItem('loss-timeline', '❌ 帧 SEQ=2 在传输中丢失', 4000);
    setTimeout(() => {
        const container = document.getElementById('loss-container');
        const packet = document.createElement('div');
        packet.className = 'packet llr-eligible';
        packet.textContent = 'SEQ:2';
        packet.style.left = '20%';
        packet.style.top = '45%';
        container.appendChild(packet);
        
        addLog('loss-log', '发送 SEQ=2...', 'info');
        
        // 包在中途消失
        setTimeout(() => {
            packet.style.opacity = '0';
            packet.style.transform = 'scale(0)';
        }, 750);
        
        setTimeout(() => {
            packet.remove();
            addLog('loss-log', '❌ SEQ=2 传输丢失', 'error');
        }, 1500);
    }, 4500);
    
    // 发送帧 SEQ=3
    addTimelineItem('loss-timeline', '发送帧 SEQ=3', 6000);
    setTimeout(() => {
        const container = document.getElementById('loss-container');
        const packet = document.createElement('div');
        packet.className = 'packet llr-eligible';
        packet.textContent = 'SEQ:3';
        packet.style.left = '20%';
        packet.style.top = '45%';
        container.appendChild(packet);
        
        packet.style.animation = 'moveRight 1.5s forwards';
        addLog('loss-log', '发送 SEQ=3', 'info');
        
        setTimeout(() => {
            packet.remove();
            addLog('loss-log', '接收 SEQ=3，期望SEQ=2', 'warning');
            addLog('loss-log', '检测到序列号跳跃：expected_frame=FALSE', 'error');
        }, 1500);
    }, 6500);
    
    // 发送NACK
    addTimelineItem('loss-timeline', '⚠️ 接收端检测到missing_frame，发送 LLR_NACK (nack_seq=1)', 8000);
    setTimeout(() => {
        document.getElementById('loss-receiver-status').textContent = 'SEND_NACK';
        
        const container = document.getElementById('loss-container');
        const nack = document.createElement('div');
        nack.className = 'packet nack';
        nack.textContent = 'NACK:1';
        nack.style.right = '20%';
        nack.style.top = '55%';
        container.appendChild(nack);
        
        nack.style.animation = 'moveLeft 1.5s forwards';
        addLog('loss-log', '发送 LLR_NACK, ack_nack_seq=1 (next_rx_seq-1)', 'warning');
        
        setTimeout(() => {
            nack.remove();
            addLog('loss-log', '发送端收到NACK，nack_received=TRUE', 'warning');
        }, 1500);
    }, 8500);
    
    // 进入REPLAY状态
    addTimelineItem('loss-timeline', '发送端：进入REPLAY状态，重传所有未确认帧', 10000);
    setTimeout(() => {
        document.getElementById('loss-sender-status').textContent = 'REPLAY';
        addLog('loss-log', '进入REPLAY状态，准备重传replay buffer中所有帧', 'warning');
    }, 10500);
    
    // 重传 SEQ=2
    addTimelineItem('loss-timeline', '重传帧 SEQ=2', 11000);
    setTimeout(() => {
        sendLossPacket(2, false);
    }, 11500);
    
    // 重传 SEQ=3
    addTimelineItem('loss-timeline', '重传帧 SEQ=3', 13000);
    setTimeout(() => {
        sendLossPacket(3, false);
    }, 13500);
    
    // 恢复正常
    addTimelineItem('loss-timeline', '✅ 重传完成，replay_done=TRUE，恢复ADVANCE状态', 15000);
    setTimeout(() => {
        document.getElementById('loss-sender-status').textContent = 'ADVANCE';
        document.getElementById('loss-receiver-status').textContent = 'SEND_ACKS';
        addLog('loss-log', '重传完成，状态恢复：TX=ADVANCE, RX=SEND_ACKS', 'success');
    }, 15500);
}

function sendLossPacket(seq, isLost) {
    const container = document.getElementById('loss-container');
    const packet = document.createElement('div');
    packet.className = 'packet llr-eligible';
    packet.textContent = `SEQ:${seq}`;
    packet.style.left = '20%';
    packet.style.top = '45%';
    container.appendChild(packet);
    
    if (!isLost) {
        packet.style.animation = 'moveRight 1.5s forwards';
        addLog('loss-log', `发送 SEQ=${seq}`, 'info');
        
        setTimeout(() => {
            packet.remove();
            addLog('loss-log', `✓ 接收 SEQ=${seq}`, 'success');
        }, 1500);
    }
}

function resetLossDemo() {
    clearAllAnimations();
    document.getElementById('loss-timeline').innerHTML = '';
    document.getElementById('loss-log').innerHTML = '';
    document.getElementById('loss-sender-status').textContent = 'ADVANCE';
    document.getElementById('loss-receiver-status').textContent = 'SEND_ACKS';
    document.querySelectorAll('#loss-container .packet').forEach(p => p.remove());
}

// ==================== 场景7: 超时重传 ====================
function startTimeoutDemo() {
    clearAllAnimations();
    document.getElementById('timeout-timeline').innerHTML = '';
    document.getElementById('timeout-log').innerHTML = '';
    
    timeoutTimer = 0;
    replayCount = 0;
    document.getElementById('replay-count').textContent = replayCount;
    document.getElementById('timer-value').textContent = timeoutTimer;
    
    addLog('timeout-log', '模拟超时重传场景...', 'warning');
    
    // 发送数据包但不响应
    addTimelineItem('timeout-timeline', '发送帧 SEQ=0，但接收端无响应', 0);
    setTimeout(() => {
        const container = document.getElementById('timeout-container');
        const packet = document.createElement('div');
        packet.className = 'packet llr-eligible';
        packet.textContent = 'SEQ:0';
        packet.style.left = '20%';
        packet.style.top = '45%';
        container.appendChild(packet);
        
        packet.style.animation = 'moveRight 1.5s forwards';
        addLog('timeout-log', '发送 SEQ=0，存入replay buffer', 'info');
        
        setTimeout(() => {
            packet.remove();
            addLog('timeout-log', '接收端无响应...', 'warning');
        }, 1500);
    }, 500);
    
    // 启动replay_timer
    addTimelineItem('timeout-timeline', '⏱️ 启动 replay_timer，等待ACK...', 2000);
    setTimeout(() => {
        addLog('timeout-log', 'replay_timer开始计时...', 'info');
        startReplayTimer();
    }, 2500);
}

function startReplayTimer() {
    const timerInterval = setInterval(() => {
        timeoutTimer += 100;
        document.getElementById('timer-value').textContent = timeoutTimer;
        
        // 模拟1500ms超时
        if (timeoutTimer >= 1500) {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 100);
    
    animationIntervals.push(timerInterval);
}

function handleTimeout() {
    replayCount++;
    document.getElementById('replay-count').textContent = replayCount;
    
    if (replayCount < replayMax) {
        addTimelineItem('timeout-timeline', `❌ replay_timer超时 (${timeoutTimer}ms)，replay_ct=${replayCount}`, timeoutTimer);
        addLog('timeout-log', `replay_timer超时，replay_ct=${replayCount}/${replayMax}`, 'warning');
        
        setTimeout(() => {
            document.getElementById('timeout-sender-status').textContent = 'REPLAY';
            addLog('timeout-log', '进入REPLAY状态，重传replay buffer中的帧', 'warning');
            
            setTimeout(() => {
                const container = document.getElementById('timeout-container');
                const packet = document.createElement('div');
                packet.className = 'packet llr-eligible';
                packet.textContent = 'SEQ:0';
                packet.style.left = '20%';
                packet.style.top = '45%';
                container.appendChild(packet);
                
                packet.style.animation = 'moveRight 1.5s forwards';
                addLog('timeout-log', `第${replayCount}次重传 SEQ=0`, 'warning');
                
                setTimeout(() => {
                    packet.remove();
                    addLog('timeout-log', '仍然无响应...', 'error');
                    
                    // 重置定时器继续下一轮
                    timeoutTimer = 0;
                    document.getElementById('timer-value').textContent = timeoutTimer;
                    document.getElementById('timeout-sender-status').textContent = 'ADVANCE';
                    
                    if (replayCount < replayMax) {
                        addLog('timeout-log', 'replay_done=TRUE，返回ADVANCE状态', 'info');
                        addLog('timeout-log', '继续等待ACK...', 'info');
                        
                        setTimeout(() => {
                            startReplayTimer();
                        }, 1000);
                    }
                }, 1500);
            }, 500);
        }, 200);
    } else {
        // 达到最大重传次数
        setTimeout(() => {
            enterFlushState();
        }, 500);
    }
}

function enterFlushState() {
    document.getElementById('timeout-sender-status').textContent = 'FLUSH';
    addTimelineItem('timeout-timeline', '❌ 达到最大重传次数 (replay_ct == replay_ct_max)', timeoutTimer);
    addLog('timeout-log', '进入 FLUSH 状态，丢弃所有replay buffer中的帧', 'error');
    
    setTimeout(() => {
        addLog('timeout-log', '清空replay buffer完成', 'warning');
        addLog('timeout-log', '如果 re_init_on_discard=TRUE，将重新初始化', 'info');
    }, 1000);
}

function resetTimeoutDemo() {
    clearAllAnimations();
    document.getElementById('timeout-timeline').innerHTML = '';
    document.getElementById('timeout-log').innerHTML = '';
    document.getElementById('timeout-sender-status').textContent = 'ADVANCE';
    document.getElementById('timeout-receiver-status').textContent = '未响应';
    timeoutTimer = 0;
    replayCount = 0;
    document.getElementById('replay-count').textContent = replayCount;
    document.getElementById('timer-value').textContent = timeoutTimer;
    document.querySelectorAll('#timeout-container .packet').forEach(p => p.remove());
}

// ==================== 场景8: TX状态机 ====================
function startTxDemo() {
    clearAllAnimations();
    document.getElementById('tx-timeline').innerHTML = '';
    document.getElementById('tx-log').innerHTML = '';
    currentTxState = 0;
    
    updateTxState(0);
    addLog('tx-log', '初始状态: LLR_OFF', 'info');
    
    // LLR_OFF -> INIT
    addTimelineItem('tx-timeline', '条件: llr_mode_remote == ON', 1000);
    setTimeout(() => {
        currentTxState = 1;
        updateTxState(1);
        addLog('tx-log', '状态转换: LLR_OFF → INIT', 'info');
        addLog('tx-log', '发送LLR_INIT消息', 'info');
    }, 1500);
    
    // INIT -> ADVANCE
    addTimelineItem('tx-timeline', '条件: init_echo_received && replay_done', 3000);
    setTimeout(() => {
        currentTxState = 2;
        updateTxState(2);
        addLog('tx-log', '状态转换: INIT → ADVANCE', 'success');
        addLog('tx-log', '开始正常数据传输...', 'info');
    }, 3500);
    
    // ADVANCE -> REPLAY
    addTimelineItem('tx-timeline', '⚠️ 收到 NACK 或 replay_timer 超时', 5500);
    setTimeout(() => {
        currentTxState = 3;
        updateTxState(3);
        addLog('tx-log', '状态转换: ADVANCE → REPLAY', 'warning');
        addLog('tx-log', '开始重传replay buffer中的所有帧...', 'warning');
    }, 6000);
    
    // REPLAY -> ADVANCE
    addTimelineItem('tx-timeline', '条件: replay_done (重传完成)', 8000);
    setTimeout(() => {
        currentTxState = 2;
        updateTxState(2);
        addLog('tx-log', '状态转换: REPLAY → ADVANCE', 'success');
        addLog('tx-log', '恢复正常传输', 'success');
    }, 8500);
    
    // ADVANCE -> REPLAY -> FLUSH
    addTimelineItem('tx-timeline', '⚠️ 再次触发重传...', 10500);
    setTimeout(() => {
        currentTxState = 3;
        updateTxState(3);
        addLog('tx-log', '状态转换: ADVANCE → REPLAY', 'warning');
    }, 11000);
    
    addTimelineItem('tx-timeline', '❌ replay_timer超时 && replay_ct == replay_ct_max', 13000);
    setTimeout(() => {
        currentTxState = 4;
        updateTxState(4);
        addLog('tx-log', '状态转换: REPLAY → FLUSH', 'error');
        addLog('tx-log', '达到最大重传次数，丢弃所有数据', 'error');
    }, 13500);
    
    // FLUSH -> INIT
    addTimelineItem('tx-timeline', '条件: flush_done && re_init_on_discard', 15500);
    setTimeout(() => {
        currentTxState = 1;
        updateTxState(1);
        addLog('tx-log', '状态转换: FLUSH → INIT', 'info');
        addLog('tx-log', '重新初始化LLR', 'info');
    }, 16000);
}

function updateTxState(stateIndex) {
    txStates.forEach((state, index) => {
        const element = document.getElementById(`tx-state-${state}`);
        if (index === stateIndex) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    });
}

function resetTxDemo() {
    clearAllAnimations();
    document.getElementById('tx-timeline').innerHTML = '';
    document.getElementById('tx-log').innerHTML = '';
    currentTxState = 0;
    updateTxState(0);
}

// ==================== 场景9: RX状态机 ====================
function startRxDemo() {
    clearAllAnimations();
    document.getElementById('rx-timeline').innerHTML = '';
    document.getElementById('rx-log').innerHTML = '';
    currentRxState = 0;
    
    updateRxState(0);
    addLog('rx-log', '初始状态: LLR_OFF', 'info');
    
    // LLR_OFF -> SEND_ACKS
    addTimelineItem('rx-timeline', '条件: llr_mode_local == ON', 1000);
    setTimeout(() => {
        currentRxState = 1;
        updateRxState(1);
        addLog('rx-log', '状态转换: LLR_OFF → SEND_ACKS', 'success');
        addLog('rx-log', '开始周期性发送LLR_ACK...', 'info');
    }, 1500);
    
    // 模拟正常接收
    addTimelineItem('rx-timeline', '✓ 接收帧 SEQ=0, expected_frame=TRUE', 3000);
    setTimeout(() => {
        addLog('rx-log', '接收帧 SEQ=0，序列号正确', 'success');
    }, 3500);
    
    addTimelineItem('rx-timeline', '✓ 接收帧 SEQ=1, expected_frame=TRUE', 5000);
    setTimeout(() => {
        addLog('rx-log', '接收帧 SEQ=1，序列号正确', 'success');
    }, 5500);
    
    // SEND_ACKS -> SEND_NACK
    addTimelineItem('rx-timeline', '❌ 接收帧 SEQ=3, expected_frame=FALSE (期望SEQ=2)', 7000);
    setTimeout(() => {
        currentRxState = 2;
        updateRxState(2);
        addLog('rx-log', '状态转换: SEND_ACKS → SEND_NACK', 'warning');
        addLog('rx-log', '检测到丢包：期望SEQ=2，收到SEQ=3', 'error');
        addLog('rx-log', 'missing_frame=TRUE, expected_frame=FALSE', 'error');
    }, 7500);
    
    // SEND_NACK -> NACK_SENT
    addTimelineItem('rx-timeline', '发送 LLR_NACK (nack_seq=1 = next_rx_seq-1)', 9000);
    setTimeout(() => {
        currentRxState = 3;
        updateRxState(3);
        addLog('rx-log', '状态转换: SEND_NACK → NACK_SENT', 'warning');
        addLog('rx-log', '已发送NACK，等待重传...', 'info');
    }, 9500);
    
    // NACK_SENT -> SEND_ACKS
    addTimelineItem('rx-timeline', '✓ 接收重传帧 SEQ=2, expected_frame=TRUE', 11500);
    setTimeout(() => {
        currentRxState = 1;
        updateRxState(1);
        addLog('rx-log', '状态转换: NACK_SENT → SEND_ACKS', 'success');
        addLog('rx-log', '收到正确序列号，恢复正常', 'success');
    }, 12000);
    
    addTimelineItem('rx-timeline', '✅ 继续正常接收和发送ACK', 13500);
    setTimeout(() => {
        addLog('rx-log', '继续周期性发送LLR_ACK', 'success');
    }, 14000);
}

function updateRxState(stateIndex) {
    rxStates.forEach((state, index) => {
        const element = document.getElementById(`rx-state-${state}`);
        if (index === stateIndex) {
            element.classList.add('active');
        } else {
            element.classList.remove('active');
        }
    });
}

function resetRxDemo() {
    clearAllAnimations();
    document.getElementById('rx-timeline').innerHTML = '';
    document.getElementById('rx-log').innerHTML = '';
    currentRxState = 0;
    updateRxState(0);
}

// ==================== 初始化 ====================
window.onload = function() {
    // 初始化buffer显示
    updateBufferDisplay();
    
    // 设置默认状态
    updateTxState(0);
    updateRxState(0);
    
    console.log('LLR动画演示系统已加载');
};