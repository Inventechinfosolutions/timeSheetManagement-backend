import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { DemoServiceCallerService } from './demo-service-caller.service';
import { DemoController } from './demo.controller';

@Module({
  controllers: [DemoController],
  providers: [CommunicationService, DemoServiceCallerService],
  exports: [CommunicationService, DemoServiceCallerService],
})
export class CommunicationModule {}
